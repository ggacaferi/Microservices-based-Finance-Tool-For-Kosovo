import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { IncomingEvent, LedgerService } from '../ledger.service';

@Injectable()
export class KafkaOperationsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaOperationsConsumer.name);
  private readonly brokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean);
  private readonly enabled = this.brokers.length > 0;
  private readonly topic = process.env.KAFKA_TOPIC_OPERATIONS_EVENTS || 'operations.events';
  private readonly groupId = process.env.KAFKA_GROUP_LEDGER_OPERATIONS || 'ledger-operations-consumer';
  private readonly clientId = process.env.KAFKA_CLIENT_ID_LEDGER_CONSUMER || 'ledger-operations-consumer-client';

  private kafka?: Kafka;
  private consumer?: Consumer;

  constructor(private readonly ledgerService: LedgerService) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Kafka disabled for ledger operations consumer; relying on HTTP /ledger/events');
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
          const evt = JSON.parse(raw) as IncomingEvent;
          await this.ledgerService.handleEvent(evt);
        } catch (err: any) {
          this.logger.error(`Failed to process Kafka message: ${err?.message || 'unknown error'}`);
        }
      },
    });

    this.logger.log(`Kafka consumer connected (${this.topic})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect().catch(() => {});
  }
}
