import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, logLevel, Producer } from 'kafkajs';

export interface BillPostedEvent   { type: 'billPosted'; tenantId: string; billId: string; supplierId: string; totalNetAmount: number; date: string; originalReference: string; }
export interface BillRevertedEvent { type: 'billReverted'; tenantId: string; billId: string; originalReference: string; date: string; reason?: string; }
export interface InvoiceSentEvent {
  type: 'invoiceSent';
  tenantId: string;
  invoiceId: string;
  customerId: string;
  totalNetAmount: number;
  date: string;
  originalReference: string;
}
export interface InvoicePaidEvent {
  type: 'invoicePaid';
  tenantId: string;
  invoiceId: string;
  totalNetAmount: number;
  date: string;
  originalReference: string;
}
export interface InvoiceRevertedEvent {
  type: 'invoiceReverted';
  tenantId: string;
  invoiceId: string;
  date: string;
  originalReference: string;
  reason?: string;
}
export interface InventoryMovementRecordedEvent {
  type: 'inventoryMovementRecorded';
  tenantId: string;
  movementId: string;
  sku: string;
  movementType: 'RECEIPT' | 'ISSUE';
  quantity: number;
  unitCost: number;
  totalValue: number;
  date: string;
  reference: string;
}
export type DomainEvent =
  | BillPostedEvent
  | BillRevertedEvent
  | InvoiceSentEvent
  | InvoicePaidEvent
  | InvoiceRevertedEvent
  | InventoryMovementRecordedEvent;

/**
 * CrossServiceEventPublisher
 *
 * Publishes domain events to peer services via HTTP POST.
 * In a full Pub/Sub deployment, replace the axios calls with
 * Google Cloud Pub/Sub topic.publishMessage() — the interface stays the same.
 *
 * Failures are logged but non-fatal: Operations has already committed its
 * own state change. Ledger/AI will reconcile on next startup or via a
 * dead-letter queue retry in production.
 */
@Injectable()
export class CrossServiceEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrossServiceEventPublisher.name);
  private readonly ledgerUrl = process.env.LEDGER_SERVICE_URL || 'http://ledger:3004';
  private readonly aiUrl     = process.env.AI_SERVICE_URL     || 'http://ai:3005';
  private readonly kafkaBrokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean);
  private readonly kafkaEnabled = this.kafkaBrokers.length > 0;
  private readonly operationsTopic = process.env.KAFKA_TOPIC_OPERATIONS_EVENTS || 'operations.events';
  private readonly kafkaClientId = process.env.KAFKA_CLIENT_ID_OPERATIONS || 'operations-service';

  private kafka?: Kafka;
  private producer?: Producer;

  async onModuleInit(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn('Kafka disabled for operations event publisher; using HTTP fallback');
      return;
    }

    this.kafka = new Kafka({ clientId: this.kafkaClientId, brokers: this.kafkaBrokers, logLevel: logLevel.NOTHING });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    await this.ensureTopic(this.operationsTopic);
    this.logger.log(`Kafka producer connected (${this.operationsTopic})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect().catch(() => {});
  }

  async publish(event: DomainEvent): Promise<void> {
    if (this.producer) {
      await this.producer.send({
        topic: this.operationsTopic,
        messages: [{ key: event.tenantId, value: JSON.stringify(event) }],
      });
      this.logger.debug(`Event published to Kafka topic ${this.operationsTopic}: ${event.type}`);
      return;
    }

    const targets = this.resolveTargets(event.type);
    await Promise.allSettled(targets.map(url => this.post(url, event)));
  }

  private async ensureTopic(topic: string): Promise<void> {
    if (!this.kafka) return;
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      const existing = await admin.listTopics();
      if (!existing.includes(topic)) {
        await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
      }
    } finally {
      await admin.disconnect();
    }
  }

  private resolveTargets(type: DomainEvent['type']): string[] {
    switch (type) {
      case 'billPosted':   return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'billReverted': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoiceSent': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoicePaid': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoiceReverted': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'inventoryMovementRecorded': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      default:             return [];
    }
  }

  private async post(url: string, body: unknown): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      await axios.post(url, body, { timeout: 5000 });
      this.logger.debug(`Event published → ${url}`);
    } catch (err: any) {
      this.logger.error(`Failed to publish event to ${url}: ${err.message}`);
    }
  }
}
