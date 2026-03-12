import { Injectable, Logger } from '@nestjs/common';

export interface BillPostedEvent   { type: 'billPosted';   billId: string; supplierId: string; totalNetAmount: number; date: string; originalReference: string; }
export interface BillRevertedEvent { type: 'billReverted'; billId: string; originalReference: string; date: string; reason?: string; }
export type DomainEvent = BillPostedEvent | BillRevertedEvent;

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
export class CrossServiceEventPublisher {
  private readonly logger = new Logger(CrossServiceEventPublisher.name);
  private readonly ledgerUrl = process.env.LEDGER_SERVICE_URL || 'http://ledger:3004';
  private readonly aiUrl     = process.env.AI_SERVICE_URL     || 'http://ai:3005';

  async publish(event: DomainEvent): Promise<void> {
    const targets = this.resolveTargets(event.type);
    await Promise.allSettled(targets.map(url => this.post(url, event)));
  }

  private resolveTargets(type: DomainEvent['type']): string[] {
    switch (type) {
      case 'billPosted':   return [`${this.ledgerUrl}/api/v1/ledger/events`];
      case 'billReverted': return [`${this.ledgerUrl}/api/v1/ledger/events`];
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
