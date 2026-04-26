import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Kafka, logLevel, Producer } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { OutboxEventOrmEntity } from '../infrastructure/persistence/events/outbox-event.orm-entity';

interface EventMeta { eventId?: string; idempotencyKey?: string; occurredAt?: string; }

export interface BillPostedEvent extends EventMeta   { type: 'billPosted'; tenantId: string; billId: string; supplierId: string; totalNetAmount: number; date: string; originalReference: string; }
export interface BillRevertedEvent extends EventMeta { type: 'billReverted'; tenantId: string; billId: string; originalReference: string; date: string; reason?: string; }
export interface BillPaidEvent extends EventMeta     { type: 'billPaid'; tenantId: string; billId: string; totalNetAmount: number; date: string; originalReference: string; }
export interface InvoiceCreatedEvent extends EventMeta {
  type: 'invoiceCreated';
  tenantId: string;
  invoiceId: string;
  customerId: string;
  totalNetAmount: number;
  date: string;
  originalReference: string;
}
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
  | BillPaidEvent
  | InvoiceCreatedEvent
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
 * Outbox-backed delivery:
 * 1) Domain event persisted in operations DB (ops_event_outbox)
 * 2) Dispatcher retries until published to Kafka/HTTP
 * 3) Event payload includes eventId + idempotencyKey for consumer dedupe
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
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;

  private kafka?: Kafka;
  private producer?: Producer;

  constructor(
    @Optional() @InjectRepository(OutboxEventOrmEntity, 'operations')
    private readonly outboxOrm?: Repository<OutboxEventOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn('Kafka disabled for operations event publisher; using HTTP fallback');
    } else {
      this.kafka = new Kafka({ clientId: this.kafkaClientId, brokers: this.kafkaBrokers, logLevel: logLevel.NOTHING });
      this.producer = this.kafka.producer();
      await this.producer.connect();
      await this.ensureTopic(this.operationsTopic);
      this.logger.log(`Kafka producer connected (${this.operationsTopic})`);
    }

    if (this.outboxOrm) {
      this.flushTimer = setInterval(() => this.flushOutbox(), 1500);
      await this.flushOutbox();
      this.logger.log('Outbox dispatcher enabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.producer?.disconnect().catch(() => {});
  }

  async publish(event: DomainEvent): Promise<void> {
    const enriched = this.enrich(event);

    if (this.outboxOrm) {
      await this.outboxOrm.save({
        tenantId: enriched.tenantId || null,
        eventType: enriched.type,
        eventId: enriched.eventId,
        idempotencyKey: enriched.idempotencyKey,
        payload: enriched,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      });
      await this.flushOutbox();
      return;
    }

    try {
      await this.deliver(enriched);
    } catch (err: any) {
      this.logger.error(`Event publish failed (${enriched.type}): ${err.message}`);
    }
  }

  private enrich<T extends DomainEvent>(event: T): T & Required<EventMeta> {
    const eventId = (event as any).eventId || uuidv4();
    const occurredAt = (event as any).occurredAt || new Date().toISOString();
    const entityRef = (event as any).billId || (event as any).invoiceId || (event as any).movementId || (event as any).originalReference || (event as any).reference || 'event';
    const idempotencyKey = (event as any).idempotencyKey || `${event.type}:${event.tenantId}:${entityRef}`;
    return { ...(event as any), eventId, occurredAt, idempotencyKey };
  }

  private async flushOutbox(): Promise<void> {
    if (!this.outboxOrm || this.isFlushing) return;
    this.isFlushing = true;
    try {
      const now = new Date();
      const rows = await this.outboxOrm.find({
        where: [
          { status: 'PENDING', nextAttemptAt: LessThanOrEqual(now) },
          { status: 'FAILED', nextAttemptAt: LessThanOrEqual(now) },
        ],
        order: { createdAt: 'ASC' },
        take: 50,
      });

      for (const row of rows) {
        try {
          await this.deliver(row.payload as DomainEvent);
          await this.outboxOrm.update(row.id, {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            attempts: row.attempts + 1,
            lastError: null,
            nextAttemptAt: null,
          });
        } catch (err: any) {
          const attempts = row.attempts + 1;
          const backoffSec = Math.min(60, 2 ** Math.min(6, attempts));
          await this.outboxOrm.update(row.id, {
            status: 'FAILED',
            attempts,
            lastError: String(err?.message || err),
            nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
          });
        }
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async deliver(event: DomainEvent): Promise<void> {
    if (this.producer) {
      await this.producer.send({
        topic: this.operationsTopic,
        messages: [{ key: event.tenantId, value: JSON.stringify(event) }],
      });
      this.logger.debug(`Event published to Kafka topic ${this.operationsTopic}: ${event.type}`);
      return;
    }

    const targets = this.resolveTargets(event.type);
    for (const target of targets) {
      await this.post(target, event);
    }
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
      case 'billPaid': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoiceCreated': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoiceSent': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoicePaid': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'invoiceReverted': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'inventoryMovementRecorded': return [`${this.ledgerUrl}/api/v1/ledger/events`];
      default:             return [];
    }
  }

  private async post(url: string, body: unknown): Promise<void> {
    const axios = (await import('axios')).default;
    await axios.post(url, body, { timeout: 5000 });
    this.logger.debug(`Event published → ${url}`);
  }
}
