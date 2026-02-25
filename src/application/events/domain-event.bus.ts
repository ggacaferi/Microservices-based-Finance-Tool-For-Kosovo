import { Injectable } from '@nestjs/common';

export interface BillPostedEvent {
  type: 'billPosted';
  billId: string;
  supplierId: string;
  totalNetAmount: number;
  date: string;
  originalReference: string;
}

export interface BillRevertedEvent {
  type: 'billReverted';
  originalReference: string;
  billId: string;
  date: string;
  reason?: string;
}

export interface JournalEntryPostedEvent {
  type: 'journalEntryPosted';
  journalEntryId: string;
  reference: string;
  date: string;
  deltaExpenses: number;
}

export type DomainEvent =
  | BillPostedEvent
  | BillRevertedEvent
  | JournalEntryPostedEvent;

@Injectable()
export class DomainEventBus {
  private readonly handlers = new Map<DomainEvent['type'], Array<(event: DomainEvent) => void>>();

  subscribe<T extends DomainEvent['type']>(
    type: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void
  ) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as (event: DomainEvent) => void);
    this.handlers.set(type, list);
  }

  publish<T extends DomainEvent>(event: T): void {
    const list = this.handlers.get(event.type) ?? [];
    for (const handler of list) {
      handler(event);
    }
  }
}
