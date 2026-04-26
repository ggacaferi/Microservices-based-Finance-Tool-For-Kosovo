import { Injectable, Logger, OnModuleDestroy, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Kafka, logLevel, Producer } from 'kafkajs';
import { JournalEntryOrmEntity } from './infrastructure/journal-entry.orm-entity';
import { LedgerIngestedEventOrmEntity } from './infrastructure/ledger-ingested-event.orm-entity';

export interface JournalLine    { account: string; debit: number; credit: number; }
export interface JournalEntry   { id: string; tenantId: string; reference: string; date: string; kind: 'ORIGINAL' | 'STORNO'; lines: JournalLine[]; amount: number; reversedBy?: string; }
interface EventMeta { eventId?: string; idempotencyKey?: string; occurredAt?: string; }

/** Events consumed from Operations Service via HTTP POST to /api/v1/ledger/events */
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
export type IncomingEvent =
  | BillPostedEvent
  | BillRevertedEvent
  | BillPaidEvent
  | InvoiceCreatedEvent
  | InvoiceSentEvent
  | InvoicePaidEvent
  | InvoiceRevertedEvent
  | InventoryMovementRecordedEvent;

const SKA = {
  CASH: '100',
  ACCOUNTS_RECEIVABLE: '140',
  INVENTORY: '125',
  ACCOUNTS_PAYABLE: '220',
  REVENUE_SALES: '700',
  COGS: '500',
  OPERATING_EXPENSES_OTHER: '665-09',
} as const;

const LEGACY_TO_SKA_ACCOUNT: Record<string, string> = {
  '1000': SKA.CASH,
  '1100': SKA.ACCOUNTS_RECEIVABLE,
  '1200': SKA.INVENTORY,
  '2000': SKA.ACCOUNTS_PAYABLE,
  '4000': SKA.REVENUE_SALES,
  '5000': SKA.COGS,
  '5100': SKA.OPERATING_EXPENSES_OTHER,
};

/**
 * LedgerService — General Ledger bounded context.
 *
 * Receives domain events from Operations via HTTP POST.
 * Publishes journalEntryPosted to AI Service via HTTP POST.
 * Owns its own Postgres database (guri_ledger).
 */
@Injectable()
export class LedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger  = new Logger(LedgerService.name);
  private readonly mem: JournalEntry[] = [];
  private readonly seenEventIds = new Set<string>();
  private readonly seenIdempotencyKeys = new Set<string>();
  private readonly aiUrl   = process.env.AI_SERVICE_URL || 'http://ai:3005';
  private readonly kafkaBrokers = (process.env.KAFKA_BROKERS || '').split(',').map(b => b.trim()).filter(Boolean);
  private readonly kafkaEnabled = this.kafkaBrokers.length > 0;
  private readonly ledgerTopic = process.env.KAFKA_TOPIC_LEDGER_EVENTS || 'ledger.events';
  private readonly kafkaClientId = process.env.KAFKA_CLIENT_ID_LEDGER_PUBLISHER || 'ledger-service';

  private kafka?: Kafka;
  private producer?: Producer;

  constructor(
    @Optional() @InjectRepository(JournalEntryOrmEntity, 'ledger')
    private readonly orm?: Repository<JournalEntryOrmEntity>,
    @Optional() @InjectRepository(LedgerIngestedEventOrmEntity, 'ledger')
    private readonly ingestedOrm?: Repository<LedgerIngestedEventOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'LedgerService: Postgres-backed' : 'LedgerService: in-memory');
  }

  async onModuleInit(): Promise<void> {
    if (this.orm) {
      const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
      for (const row of rows) {
        this.mem.push({
          id: row.id,
          tenantId: row.tenantId || 'legacy',
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
    await this.initKafkaProducer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer?.disconnect().catch(() => {});
  }

  async handleEvent(event: IncomingEvent): Promise<void> {
    if (!(await this.shouldProcess(event))) return;
    if (event.type === 'billPosted')   await this.onBillPosted(event);
    if (event.type === 'billReverted') await this.onBillReverted(event);
    if (event.type === 'billPaid') await this.onBillPaid(event);
    if (event.type === 'invoiceCreated') await this.onInvoiceCreated(event);
    if (event.type === 'invoiceSent') await this.onInvoiceSent(event);
    if (event.type === 'invoicePaid') await this.onInvoicePaid(event);
    if (event.type === 'invoiceReverted') await this.onInvoiceReverted(event);
    if (event.type === 'inventoryMovementRecorded') await this.onInventoryMovementRecorded(event);
  }

  private async shouldProcess(event: IncomingEvent): Promise<boolean> {
    const eventId = (event as any).eventId as string | undefined;
    const idempotencyKey = (event as any).idempotencyKey as string | undefined;
    if (!eventId && !idempotencyKey) return true;

    if (this.ingestedOrm) {
      if (idempotencyKey) {
        const where: any = { eventType: event.type, idempotencyKey };
        if (event.tenantId) where.tenantId = event.tenantId;
        const exists = await this.ingestedOrm.findOne({ where });
        if (exists) {
          this.logger.warn(`Duplicate event skipped (idempotencyKey): ${idempotencyKey}`);
          return false;
        }
      }

      try {
        await this.ingestedOrm.save({
          eventId: eventId || uuidv4(),
          tenantId: event.tenantId || null,
          eventType: event.type,
          idempotencyKey: idempotencyKey || null,
        });
        return true;
      } catch {
        this.logger.warn(`Duplicate event skipped (eventId): ${eventId || 'none'}`);
        return false;
      }
    }

    if (eventId && this.seenEventIds.has(eventId)) {
      this.logger.warn(`Duplicate event skipped (memory/eventId): ${eventId}`);
      return false;
    }
    if (idempotencyKey && this.seenIdempotencyKeys.has(idempotencyKey)) {
      this.logger.warn(`Duplicate event skipped (memory/idempotencyKey): ${idempotencyKey}`);
      return false;
    }
    if (eventId) this.seenEventIds.add(eventId);
    if (idempotencyKey) this.seenIdempotencyKeys.add(idempotencyKey);
    return true;
  }

  getAllEntries(tenantId: string, kind?: string): JournalEntry[] {
    const all = [...this.mem].filter(e => e.tenantId === tenantId).sort((a, b) => a.date > b.date ? -1 : 1);
    return kind ? all.filter(e => e.kind === kind) : all;
  }

  getEntryById(tenantId: string, id: string): JournalEntry | undefined      { return this.mem.find(e => e.id === id && e.tenantId === tenantId); }
  getEntriesForReference(tenantId: string, ref: string): JournalEntry[]     { return this.mem.filter(e => e.reference === ref && e.tenantId === tenantId).sort((a, b) => a.date > b.date ? -1 : 1); }
  explainBillWorkflow(tenantId: string, billId: string)                     { return { originalReference: `Bill-${billId}`, journalEntries: this.getEntriesForReference(tenantId, `Bill-${billId}`) }; }

  getTrialBalance(tenantId: string) {
    const map = new Map<string, { totalDebit: number; totalCredit: number }>();
    for (const e of this.mem.filter(e => e.tenantId === tenantId)) for (const l of e.lines) {
      const account = this.normalizeAccountCode(l.account);
      const cur = map.get(account) ?? { totalDebit: 0, totalCredit: 0 };
      cur.totalDebit += l.debit; cur.totalCredit += l.credit;
      map.set(account, cur);
    }
    return [...map.entries()].map(([account, t]) => ({ account, totalDebit: Math.round(t.totalDebit * 100) / 100, totalCredit: Math.round(t.totalCredit * 100) / 100, balance: Math.round((t.totalDebit - t.totalCredit) * 100) / 100 }));
  }

  getSummary(tenantId: string) {
    let td = 0, tc = 0;
    const own = this.mem.filter(e => e.tenantId === tenantId);
    for (const e of own) for (const l of e.lines) { td += l.debit; tc += l.credit; }
    return { totalEntries: own.length, originalEntries: own.filter(e => e.kind === 'ORIGINAL').length, stornoEntries: own.filter(e => e.kind === 'STORNO').length, totalDebits: Math.round(td * 100) / 100, totalCredits: Math.round(tc * 100) / 100, balanced: Math.abs(td - tc) < 0.01 };
  }

  generateProfitLossCsv(tenantId: string, year: number, quarter: number): string {
    const { start, end } = this.quarterRange(year, quarter);
    const entries = this.mem.filter(e => e.tenantId === tenantId && e.date >= start && e.date <= end);

    let revenue = 0;
    let cogs = 0;
    let operatingExpenses = 0;

    for (const e of entries) {
      for (const l of e.lines) {
        const code = this.normalizeAccountCode(l.account);
        const netCredit = l.credit - l.debit;
        const netDebit = l.debit - l.credit;
        if (code.startsWith('7')) revenue += netCredit;
        if (code === SKA.COGS) cogs += netDebit;
        if (code.startsWith('6')) operatingExpenses += netDebit;
      }
    }

    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - operatingExpenses;

    const rows = [
      ['Administrata Tatimore e Kosovës (TAK)'],
      ['Pasqyra e të Ardhurave dhe Shpenzimeve (P&L)'],
      [`Periudha`, `Q${quarter} ${year}`],
      ['Monedha', 'EUR'],
      [],
      ['Kodi', 'Përshkrimi', 'Vlera (EUR)'],
      [SKA.REVENUE_SALES, 'Të hyrat nga shitja', this.money(revenue)],
      [SKA.COGS, 'Kosto e mallrave të shitura (COGS)', this.money(cogs)],
      ['', 'Fitimi bruto', this.money(grossProfit)],
      ['6xx', 'Shpenzime operative', this.money(operatingExpenses)],
      ['', 'Fitimi / Humbja neto e periudhës', this.money(netProfit)],
    ];
    return rows.map(r => r.join(',')).join('\n');
  }

  generateBalanceSheetCsv(tenantId: string, year: number, quarter: number): string {
    const { end } = this.quarterRange(year, quarter);
    const entries = this.mem.filter(e => e.tenantId === tenantId && e.date <= end);

    const netByAccount = new Map<string, number>();
    for (const e of entries) {
      for (const l of e.lines) {
        const account = this.normalizeAccountCode(l.account);
        const cur = netByAccount.get(account) ?? 0;
        netByAccount.set(account, cur + (l.debit - l.credit));
      }
    }

    const sumByPrefix = (prefix: string) => {
      let total = 0;
      for (const [acc, value] of netByAccount.entries()) {
        if (acc.startsWith(prefix)) total += value;
      }
      return total;
    };

    const assets = Math.max(0, sumByPrefix('1'));
    const liabilities = Math.max(0, -sumByPrefix('2'));
    const equity = assets - liabilities;

    const rows = [
      ['Administrata Tatimore e Kosovës (TAK)'],
      ['Bilanci i Gjendjes (Balance Sheet)'],
      ['Data e raportimit', end],
      ['Monedha', 'EUR'],
      [],
      ['Seksioni', 'Kodi', 'Përshkrimi', 'Vlera (EUR)'],
      ['AKTIVA', '1xxx', 'Totali i aktiveve', this.money(assets)],
      ['DETYRIMET', '2xxx', 'Totali i detyrimeve', this.money(liabilities)],
      ['KAPITALI', '3xxx', 'Kapitali / rezultati i mbajtur', this.money(equity)],
      ['', '', 'Totali i detyrimeve + kapitalit', this.money(liabilities + equity)],
    ];
    return rows.map(r => r.join(',')).join('\n');
  }

  // ── Private ─────────────────────────────────────────────

  private quarterRange(year: number, quarter: number): { start: string; end: string } {
    const q = Math.min(4, Math.max(1, quarter));
    const startMonth = (q - 1) * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  private money(value: number): string {
    return (Math.round(value * 100) / 100).toFixed(2);
  }

  private normalizeAccountCode(account: string): string {
    return LEGACY_TO_SKA_ACCOUNT[account] ?? account;
  }

  private async onBillPosted(event: BillPostedEvent): Promise<void> {
    const entry: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: event.originalReference, date: event.date, kind: 'ORIGINAL',
      amount: event.totalNetAmount,
      // Kosovo SKA posting: operating expense (debit) / supplier payable (credit)
      lines: [
        { account: SKA.OPERATING_EXPENSES_OTHER, debit: event.totalNetAmount, credit: 0 },
        { account: SKA.ACCOUNTS_PAYABLE, debit: 0, credit: event.totalNetAmount },
      ],
    };
    this.mem.push(entry);
    await this.persist(entry);
    this.logger.log(`Journal entry posted for ${event.originalReference} (€${event.totalNetAmount})`);
    await this.notifyAi({ type: 'journalEntryPosted', tenantId: event.tenantId, journalEntryId: entry.id, reference: entry.reference, date: entry.date, deltaExpenses: event.totalNetAmount });
  }

  private async onBillReverted(event: BillRevertedEvent): Promise<void> {
    const original = this.mem.find(e => e.tenantId === event.tenantId && e.reference === event.originalReference && e.kind === 'ORIGINAL' && !e.reversedBy);
    if (!original) { this.logger.warn(`No original journal entry found for ${event.originalReference}`); return; }

    const storno: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: event.originalReference, date: event.date, kind: 'STORNO',
      amount: original.amount,
      lines: original.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })),
    };
    original.reversedBy = storno.id;
    this.mem.push(storno);
    await this.persist(storno);
    if (this.orm) await this.orm.update(original.id, { reversedBy: storno.id }).catch(() => {});
    this.logger.log(`Storno entry created for ${event.originalReference}`);
    await this.notifyAi({ type: 'journalEntryPosted', tenantId: event.tenantId, journalEntryId: storno.id, reference: storno.reference, date: storno.date, deltaExpenses: -original.amount });
  }

  private async onInvoiceSent(event: InvoiceSentEvent): Promise<void> {
    // Commercial workflow transition only. Accounting recognition happens on invoiceCreated.
    this.logger.debug(`Invoice ${event.invoiceId} sent (no additional ledger posting)`);
  }

  private async onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
    const entry: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: event.originalReference, date: event.date, kind: 'ORIGINAL', amount: event.totalNetAmount,
      lines: [
        { account: SKA.ACCOUNTS_RECEIVABLE, debit: event.totalNetAmount, credit: 0 },
        { account: SKA.REVENUE_SALES, debit: 0, credit: event.totalNetAmount },
      ],
    };
    this.mem.push(entry);
    await this.persist(entry);
    await this.notifyAi({ type: 'journalEntryPosted', tenantId: event.tenantId, journalEntryId: entry.id, reference: entry.reference, date: entry.date, deltaExpenses: -event.totalNetAmount });
  }

  private async onBillPaid(event: BillPaidEvent): Promise<void> {
    const entry: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: `${event.originalReference}-PAYMENT`, date: event.date, kind: 'ORIGINAL', amount: event.totalNetAmount,
      lines: [
        { account: SKA.ACCOUNTS_PAYABLE, debit: event.totalNetAmount, credit: 0 },
        { account: SKA.CASH, debit: 0, credit: event.totalNetAmount },
      ],
    };
    this.mem.push(entry);
    await this.persist(entry);
  }

  private async onInvoicePaid(event: InvoicePaidEvent): Promise<void> {
    const entry: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: `${event.originalReference}-PAYMENT`, date: event.date, kind: 'ORIGINAL', amount: event.totalNetAmount,
      lines: [
        { account: SKA.CASH, debit: event.totalNetAmount, credit: 0 },
        { account: SKA.ACCOUNTS_RECEIVABLE, debit: 0, credit: event.totalNetAmount },
      ],
    };
    this.mem.push(entry);
    await this.persist(entry);
  }

  private async onInvoiceReverted(event: InvoiceRevertedEvent): Promise<void> {
    const original = this.mem.find(e => e.tenantId === event.tenantId && e.reference === event.originalReference && e.kind === 'ORIGINAL' && !e.reversedBy);
    if (!original) return;
    const storno: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: event.originalReference, date: event.date, kind: 'STORNO', amount: original.amount,
      lines: original.lines.map(l => ({ account: l.account, debit: l.credit, credit: l.debit })),
    };
    original.reversedBy = storno.id;
    this.mem.push(storno);
    await this.persist(storno);
    if (this.orm) await this.orm.update(original.id, { reversedBy: storno.id }).catch(() => {});
  }

  private async onInventoryMovementRecorded(event: InventoryMovementRecordedEvent): Promise<void> {
    const lines: JournalLine[] = event.movementType === 'RECEIPT'
      ? [
          { account: SKA.INVENTORY, debit: event.totalValue, credit: 0 },
          { account: SKA.ACCOUNTS_PAYABLE, debit: 0, credit: event.totalValue },
        ]
      : [
          { account: SKA.COGS, debit: event.totalValue, credit: 0 },
          { account: SKA.INVENTORY, debit: 0, credit: event.totalValue },
        ];

    const entry: JournalEntry = {
      id: uuidv4(), tenantId: event.tenantId, reference: event.reference, date: event.date, kind: 'ORIGINAL', amount: event.totalValue, lines,
    };

    this.mem.push(entry);
    await this.persist(entry);
    await this.notifyAi({ type: 'journalEntryPosted', tenantId: event.tenantId, journalEntryId: entry.id, reference: entry.reference, date: entry.date, deltaExpenses: event.movementType === 'ISSUE' ? event.totalValue : 0 });
  }

  private async persist(entry: JournalEntry): Promise<void> {
    if (!this.orm) return;
    await this.orm.save({ id: entry.id, tenantId: entry.tenantId, reference: entry.reference, date: entry.date, kind: entry.kind, amount: entry.amount, lines: entry.lines, reversedBy: entry.reversedBy }).catch(err => this.logger.error(`Persist failed: ${err.message}`));
  }

  private async notifyAi(payload: object): Promise<void> {
    if (this.producer) {
      try {
        const key = (payload as any)?.tenantId || 'public';
        await this.producer.send({
          topic: this.ledgerTopic,
          messages: [{ key, value: JSON.stringify(payload) }],
        });
        return;
      } catch (err: any) {
        this.logger.warn(`Failed to publish Kafka ledger event: ${err.message}`);
      }
    }

    try {
      const axios = (await import('axios')).default;
      await axios.post(`${this.aiUrl}/api/v1/ai/events`, payload, { timeout: 3000 });
    } catch (err: any) {
      this.logger.warn(`Failed to notify AI Service: ${err.message}`);
    }
  }

  private async initKafkaProducer(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn('Kafka disabled for ledger publisher; using HTTP fallback to AI');
      return;
    }

    this.kafka = new Kafka({ clientId: this.kafkaClientId, brokers: this.kafkaBrokers, logLevel: logLevel.NOTHING });
    this.producer = this.kafka.producer();
    await this.producer.connect();
    await this.ensureTopic(this.ledgerTopic);
    this.logger.log(`Kafka producer connected (${this.ledgerTopic})`);
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
}
