import { Injectable, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  BillPostedEvent,
  BillRevertedEvent,
  DomainEventBus,
  JournalEntryPostedEvent
} from '../events/domain-event.bus';
import { ActivityLogService } from '../operations/activity-log.service';

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  reference: string;
  date: string;
  kind: 'ORIGINAL' | 'STORNO';
  lines: JournalLine[];
  amount: number;
  reversedBy?: string;
}

export interface BillLedgerWorkflow {
  originalReference: string;
  journalEntries: JournalEntry[];
}

@Injectable()
export class LedgerIntegrationService implements OnModuleInit {
  private readonly entries: JournalEntry[] = [];

  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly activityLogService: ActivityLogService
  ) {}

  onModuleInit(): void {
    this.domainEventBus.subscribe('billPosted', (event) => this.onBillPosted(event));
    this.domainEventBus.subscribe('billReverted', (event) => this.onBillReverted(event));
  }

  getEntriesForReference(reference: string): JournalEntry[] {
    return this.entries
      .filter((entry) => entry.reference === reference)
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }

  explainBillWorkflow(billId: string): BillLedgerWorkflow {
    const reference = `Bill-${billId}`;
    return {
      originalReference: reference,
      journalEntries: this.getEntriesForReference(reference)
    };
  }

  private onBillPosted(event: BillPostedEvent): void {
    const entry: JournalEntry = {
      id: uuidv4(),
      reference: event.originalReference,
      date: event.date,
      kind: 'ORIGINAL',
      amount: event.totalNetAmount,
      lines: [
        { account: 'Expense', debit: event.totalNetAmount, credit: 0 },
        { account: 'AccountsPayable', debit: 0, credit: event.totalNetAmount }
      ]
    };

    this.entries.push(entry);

    this.activityLogService.record('LEDGER_JOURNAL_ENTRY_POSTED', {
      entityId: entry.id,
      summary: `Original journal entry posted for ${event.originalReference}`
    });

    const journalEvent: JournalEntryPostedEvent = {
      type: 'journalEntryPosted',
      journalEntryId: entry.id,
      reference: entry.reference,
      date: entry.date,
      deltaExpenses: event.totalNetAmount
    };

    this.domainEventBus.publish(journalEvent);
  }

  private onBillReverted(event: BillRevertedEvent): void {
    const original = this.entries.find(
      (entry) =>
        entry.reference === event.originalReference &&
        entry.kind === 'ORIGINAL' &&
        !entry.reversedBy
    );

    if (!original) {
      this.activityLogService.record('LEDGER_STORNO_SKIPPED', {
        entityId: event.billId,
        summary: `No original journal entry found for ${event.originalReference}`
      });
      return;
    }

    const storno: JournalEntry = {
      id: uuidv4(),
      reference: event.originalReference,
      date: event.date,
      kind: 'STORNO',
      amount: original.amount,
      lines: original.lines.map((line) => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit
      }))
    };

    original.reversedBy = storno.id;
    this.entries.push(storno);

    this.activityLogService.record('LEDGER_STORNO_ENTRY_POSTED', {
      entityId: storno.id,
      summary: `Storno journal created for ${event.originalReference}`,
      metadata: { reason: event.reason ?? '' }
    });

    const journalEvent: JournalEntryPostedEvent = {
      type: 'journalEntryPosted',
      journalEntryId: storno.id,
      reference: storno.reference,
      date: storno.date,
      deltaExpenses: -original.amount
    };

    this.domainEventBus.publish(journalEvent);
  }
}
