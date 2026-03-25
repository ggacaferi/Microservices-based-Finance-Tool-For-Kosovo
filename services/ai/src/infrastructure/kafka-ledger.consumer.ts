import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { AiService, JournalEntryPostedEvent } from '../ai.service';

@Injectable()
export class KafkaLedgerConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaLedgerConsumer.name);
  private readonly brokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean);
  private readonly enabled = this.brokers.length > 0;
  private readonly topic = process.env.KAFKA_TOPIC_LEDGER_EVENTS || 'ledger.events';
  private readonly groupId = process.env.KAFKA_GROUP_AI_LEDGER || 'ai-ledger-consumer';
  private readonly clientId = process.env.KAFKA_CLIENT_ID_AI_CONSUMER || 'ai-ledger-consumer-client';

  private kafka?: Kafka;
  private consumer?: Consumer;

  constructor(private readonly aiService: AiService) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Kafka disabled for AI ledger consumer; relying on HTTP /ai/events');
      return;
    }

    this.kafka = new Kafka({ clientId: this.clientId, brokers: this.brokers, logLevel: logLevel.NOTHING });
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }: { message: any }) => {
        const raw = message.value?.toString() || '';
        if (!raw) return;
        try {
          const evt = JSON.parse(raw) as JournalEntryPostedEvent;
          if (evt?.type === 'journalEntryPosted') this.aiService.ingestEvent(evt);
        } catch (err: any) {
          this.logger.error(`Failed to process ledger Kafka message: ${err?.message || 'unknown error'}`);
        }
      },
    });

    this.logger.log(`Kafka consumer connected (${this.topic})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect().catch(() => {});
  }
}
