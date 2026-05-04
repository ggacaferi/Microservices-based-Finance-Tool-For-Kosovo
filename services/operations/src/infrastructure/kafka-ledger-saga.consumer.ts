import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { BillService } from '../application/bills/bill.service';
import { InvoiceService } from '../application/invoices/invoice.service';

interface StornoPostedEvent {
  type: 'stornoPosted';
  tenantId: string;
  originalReference: string;
  sourceType: 'bill' | 'invoice';
  stornoEntryId: string;
}

interface StornoFailedEvent {
  type: 'stornoFailed';
  tenantId: string;
  originalReference: string;
  sourceType: 'bill' | 'invoice';
  error: string;
}

type SagaReplyEvent = StornoPostedEvent | StornoFailedEvent;

/**
 * Consumes saga reply events (stornoPosted | stornoFailed) from ledger.events.
 *
 * Uses a dedicated consumer group so it receives every message independently
 * from the AI service's consumer group on the same topic.
 *
 * stornoPosted  → calls BillService/InvoiceService.handleStornoPosted()  (REVERSING → REVERTED)
 * stornoFailed  → calls BillService/InvoiceService.handleStornoFailed()  (REVERSING → POSTED/SENT)
 */
@Injectable()
export class KafkaLedgerSagaConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaLedgerSagaConsumer.name);
  private readonly brokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean);
  private readonly enabled = this.brokers.length > 0;
  private readonly topic = process.env.KAFKA_TOPIC_LEDGER_EVENTS || 'ledger.events';
  private readonly groupId = process.env.KAFKA_GROUP_OPS_SAGA || 'operations-storno-saga-consumer';
  private readonly clientId = process.env.KAFKA_CLIENT_ID_OPS_SAGA || 'operations-storno-saga-client';

  private kafka?: Kafka;
  private consumer?: Consumer;

  constructor(
    private readonly billService: BillService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Kafka disabled for storno saga consumer; saga replies must arrive via HTTP /operations/saga/storno-reply');
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
          const evt = JSON.parse(raw) as SagaReplyEvent;
          if (evt?.type === 'stornoPosted' || evt?.type === 'stornoFailed') {
            await this.handleReply(evt);
          }
        } catch (err: any) {
          this.logger.error(`Failed to process saga reply: ${err?.message || 'unknown error'}`);
        }
      },
    });

    this.logger.log(`Storno saga consumer connected (topic: ${this.topic}, group: ${this.groupId})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer?.disconnect().catch(() => {});
  }

  /** Also callable directly from the HTTP fallback endpoint. */
  async handleReply(evt: SagaReplyEvent): Promise<void> {
    if (evt.type === 'stornoPosted') {
      this.logger.log(`Saga reply: stornoPosted for ${evt.originalReference} (${evt.sourceType})`);
      if (evt.sourceType === 'bill') {
        await this.billService.handleStornoPosted(evt.tenantId, evt.originalReference);
      } else {
        await this.invoiceService.handleStornoPosted(evt.tenantId, evt.originalReference);
      }
    } else {
      this.logger.warn(`Saga reply: stornoFailed for ${evt.originalReference} (${evt.sourceType}) — compensating. Reason: ${evt.error}`);
      if (evt.sourceType === 'bill') {
        await this.billService.handleStornoFailed(evt.tenantId, evt.originalReference, evt.error);
      } else {
        await this.invoiceService.handleStornoFailed(evt.tenantId, evt.originalReference, evt.error);
      }
    }
  }
}
