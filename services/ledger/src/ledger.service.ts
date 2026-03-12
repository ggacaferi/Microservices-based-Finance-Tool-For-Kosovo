import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JournalEntryOrmEntity } from './infrastructure/journal-entry.orm-entity';

export interface JournalLine    { account: string; debit: number; credit: number; }
export interface JournalEntry   { id: string; reference: string; date: string; kind: 'ORIGINAL' | 'STORNO'; lines: JournalLine[]; amount: number; reversedBy?: string; }

/** Events consumed from Operations Service via HTTP POST to /api/v1/ledger/events */
export interface BillPostedEvent   { type: 'billPosted';   billId: string; supplierId: string; totalNetAmount: number; date: string; originalReference: string; }
export interface BillRevertedEvent { type: 'billReverted'; billId: string; originalReference: string; date: string; reason?: string; }
export type IncomingEvent = BillPostedEvent | BillRevertedEvent;

/**
 * LedgerService — General Ledger bounded context.
 *
 * Receives domain events from Operations via HTTP POST.
 * Publishes journalEntryPosted to AI Service via HTTP POST.
 * Owns its own Postgres database (guri_ledger).
 */
@Injectable()
export class LedgerService implements OnModuleInit {
  private readonly logger  = new Logger(LedgerService.name);
  private readonly mem: JournalEntry[] = [];
  private readonly aiUrl   = process.env.AI_SERVICE_URL || 'http://ai:3005';

  constructor(
    @Optional() @InjectRepository(JournalEntryOrmEntity, 'ledger')
    private readonly orm?: Repository<JournalEntryOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'LedgerService: Postgres-backed' : 'LedgerService: in-memory');
  }

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
    for (const row of rows) {
      this.mem.push({
        id: row.id,
        reference: row.reference,
        date: row.date,
        kind: row.kind as 'ORIGINAL' | 'STORNO',
        amount: Number(row.amount),
        lines: row.lines,
        reversedBy: row.reversedBy,
      });
    }
    if (rows.length > 0) this.logger.log(`Rehydrated ${rows.length} journal entries from Postgres`);
  }

  async handleEvent(event: IncomingEvent): Promise<void> {
    if (event.type === 'billPosted')   await this.onBillPosted(event);
    if (event.type === 'billReverted') await this.onBillReverted(event);
  }

  getAllEntries(kind?: string): JournalEntry[] {
    const all = [...this.mem].sort((a, b) => a.date > b.date ? -1 : 1);
    return kind ? all.filter(e => e.kind === kind) : all;
  }

  getEntryById(id: string): JournalEntry | undefined      { return this.mem.find(e => e.id === id); }
  getEntriesForReference(ref: string): JournalEntry[]     { return this.mem.filter(e => e.reference === ref).sort((a, b) => a.date > b.date ? -1 : 1); }
  explainBillWorkflow(billId: string)                     { return { originalReference: `Bill-${billId}`, journalEntries: this.getEntriesForReference(`Bill-${billId}`) }; }

  getTrialBalance() {
    const map = new Map<string, { totalDebit: number; totalCredit: number }>();
    for (const e of this.mem) for (const l of e.lines) {
      const cur = map.get(l.account) ?? { totalDebit: 0, totalCredit: 0 };
      cur.totalDebit += l.debit; cur.totalCredit += l.credit;
      map.set(l.account, cur);
    }
    return [...map.entries()].map(([account, t]) => ({ account, totalDebit: Math.round(t.totalDebit * 100) / 100, totalCredit: Math.round(t.totalCredit * 100) / 100, balance: Math.round((t.totalDebit - t.totalCredit) * 100) / 100 }));
  }

  getSummary() {
    let td = 0, tc = 0;
    for (const e of this.mem) for (const l of e.lines) { td += l.debit; tc += l.credit; }
    return { totalEntries: this.mem.length, originalEntries: this.mem.filter(e => e.kind === 'ORIGINAL').length, stornoEntries: this.mem.filter(e => e.kind === 'STORNO').length, totalDebits: Math.round(td * 100) / 100, totalCredits: Math.round(tc * 100) / 100, balanced: Math.abs(td - tc) < 0.01 };
  }

  // ── Private ─────────────────────────────────────────────

  private async onBillPosted(event: BillPostedEvent): Promise<void> {
    const entry: JournalEntry = {
      id: uuidv4(), reference: event.originalReference, date: event.date, kind: 'ORIGINAL',
      amount: event.totalNetAmount,
      // Use proper SKA codes: 5100 Operating Expenses (debit) / 2000 Accounts Payable (credit)
      lines: [
        { account: '5100', debit: event.totalNetAmount, credit: 0 },
        { account: '2000', debit: 0, credit: event.totalNetAmount },
      ],
    };
    this.mem.push(entry);
    await this.persist(entry);
    this.logger.log(`Journal entry posted for ${event.originalReference} (€${event.totalNetAmount})`);
    await this.notifyAi({ type: 'journalEntryPosted', journalEntryId: entry.id, reference: entry.reference, date: entry.date, deltaExpenses: event.totalNetAmount });
  }

  private async onBillReverted(event: BillRevertedEvent): Promise<void> {
    const original = this.mem.find(e => e.reference === event.originalReference && e.kind === 'ORIGINAL' && !e.reversedBy);
    if (!original) { this.logger.warn(`No original journal entry found for ${event.originalReference}`); return; }

    const storno: JournalEntry = {
      id: uuidv4(), reference: event.originalReference, date: event.date, kind: 'STORNO',
      amount: original.amount,
      lines: original.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })),
    };
    original.reversedBy = storno.id;
    this.mem.push(storno);
    await this.persist(storno);
    if (this.orm) await this.orm.update(original.id, { reversedBy: storno.id }).catch(() => {});
    this.logger.log(`Storno entry created for ${event.originalReference}`);
    await this.notifyAi({ type: 'journalEntryPosted', journalEntryId: storno.id, reference: storno.reference, date: storno.date, deltaExpenses: -original.amount });
  }

  private async persist(entry: JournalEntry): Promise<void> {
    if (!this.orm) return;
    await this.orm.save({ id: entry.id, reference: entry.reference, date: entry.date, kind: entry.kind, amount: entry.amount, lines: entry.lines, reversedBy: entry.reversedBy }).catch(err => this.logger.error(`Persist failed: ${err.message}`));
  }

  private async notifyAi(payload: object): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      await axios.post(`${this.aiUrl}/api/v1/ai/events`, payload, { timeout: 3000 });
    } catch (err: any) {
      this.logger.warn(`Failed to notify AI Service: ${err.message}`);
    }
  }
}
