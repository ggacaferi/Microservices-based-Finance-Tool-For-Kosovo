import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  BillPostedEvent,
  BillRevertedEvent,
  DomainEventBus,
  JournalEntryPostedEvent
} from '../events/domain-event.bus';
import { ActivityLogService } from '../operations/activity-log.service';
import { JournalEntryOrmEntity } from '../../infrastructure/persistence/ledger/journal-entry.orm-entity';

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

/**
 * Ledger Integration Service — Double-Entry Bookkeeping
 *
 * Database: Postgres (guri_ledger) — stores journal entries
 * Falls back to in-memory when LEDGER_DB_HOST is not set.
 * Consumes events via Google Cloud Pub/Sub (or in-memory bus).
 */
@Injectable()
export class LedgerIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(LedgerIntegrationService.name);
  private readonly entries: JournalEntry[] = [];

  constructor(
    private readonly domainEventBus: DomainEventBus,
    private readonly activityLogService: ActivityLogService,
    @Optional() @InjectRepository(JournalEntryOrmEntity, 'ledger')
    private readonly ormRepo?: Repository<JournalEntryOrmEntity>,
  ) {
    if (this.ormRepo) {
      this.logger.log('LedgerService: Postgres-backed (ledger_journal_entries)');
    } else {
      this.logger.log('LedgerService: in-memory fallback');
    }
  }

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

  getAllEntries(): JournalEntry[] {
    return [...this.entries].sort((a, b) => (a.date > b.date ? -1 : 1));
  }

  getEntryById(id: string): JournalEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  getTrialBalance(): { account: string; totalDebit: number; totalCredit: number; balance: number }[] {
    const accountMap = new Map<string, { totalDebit: number; totalCredit: number }>();

    for (const entry of this.entries) {
      for (const line of entry.lines) {
        const existing = accountMap.get(line.account) ?? { totalDebit: 0, totalCredit: 0 };
        existing.totalDebit += line.debit;
        existing.totalCredit += line.credit;
        accountMap.set(line.account, existing);
      }
    }

    return [...accountMap.entries()].map(([account, totals]) => ({
      account,
      totalDebit: Math.round(totals.totalDebit * 100) / 100,
      totalCredit: Math.round(totals.totalCredit * 100) / 100,
      balance: Math.round((totals.totalDebit - totals.totalCredit) * 100) / 100
    }));
  }

  getSummary(): {
    totalEntries: number;
    originalEntries: number;
    stornoEntries: number;
    totalDebits: number;
    totalCredits: number;
    balanced: boolean;
  } {
    const originals = this.entries.filter((e) => e.kind === 'ORIGINAL');
    const stornos = this.entries.filter((e) => e.kind === 'STORNO');

    let totalDebits = 0;
    let totalCredits = 0;
    for (const entry of this.entries) {
      for (const line of entry.lines) {
        totalDebits += line.debit;
        totalCredits += line.credit;
      }
    }

    return {
      totalEntries: this.entries.length,
      originalEntries: originals.length,
      stornoEntries: stornos.length,
      totalDebits: Math.round(totalDebits * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      balanced: Math.abs(totalDebits - totalCredits) < 0.01
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
    this.persistEntry(entry);

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
    this.persistEntry(storno);
    this.persistReversedBy(original.id, storno.id);

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

  private persistEntry(entry: JournalEntry): void {
    if (!this.ormRepo) return;
    this.ormRepo.save({
      id: entry.id,
      reference: entry.reference,
      date: entry.date,
      kind: entry.kind,
      amount: entry.amount,
      lines: entry.lines,
      reversedBy: entry.reversedBy ?? undefined,
    }).catch((err) => this.logger.error(`Failed to persist journal entry: ${err.message}`));
  }

  private persistReversedBy(entryId: string, reversedBy: string): void {
    if (!this.ormRepo) return;
    this.ormRepo.update(entryId, { reversedBy })
      .catch((err) => this.logger.error(`Failed to update reversedBy: ${err.message}`));
  }
}
