import { Injectable, NotFoundException, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from '../operations/activity-log.service';
import { InvoiceOrmEntity } from '../../infrastructure/persistence/invoices/invoice.orm-entity';

export enum InvoiceStatus { Draft = 'DRAFT', Sent = 'SENT', Paid = 'PAID', Reverted = 'REVERTED' }

export interface InvoiceLine { description: string; quantity: number; unitPrice: number; }

export interface InvoiceRecord {
  id: string; customerId: string; issueDate: string; dueDate?: string | null;
  currency: string; status: InvoiceStatus; lines: InvoiceLine[];
}

@Injectable()
export class InvoiceService implements OnModuleInit {
  private readonly items = new Map<string, InvoiceRecord>();

  constructor(
    private readonly activityLogService: ActivityLogService,
    @Optional() @InjectRepository(InvoiceOrmEntity, 'operations')
    private readonly orm?: Repository<InvoiceOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
    for (const r of rows) {
      this.items.set(r.id, {
        id: r.id, customerId: r.customerId, issueDate: r.issueDate,
        dueDate: r.dueDate, currency: r.currency,
        status: r.status as InvoiceStatus, lines: r.lines,
      });
    }
  }

  private async persist(inv: InvoiceRecord): Promise<void> {
    if (!this.orm) return;
    await this.orm.save({
      id: inv.id, customerId: inv.customerId, issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? null, currency: inv.currency,
      status: inv.status, lines: inv.lines,
    });
  }

  async createDraft(payload: {
    customerId: string; issueDate: string; dueDate?: string;
    currency: string; lines: InvoiceLine[];
  }): Promise<InvoiceRecord> {
    if (!payload.lines?.length) throw new Error('At least one invoice line is required');
    const invoice: InvoiceRecord = {
      id: uuidv4(), customerId: payload.customerId, issueDate: payload.issueDate,
      dueDate: payload.dueDate ?? null, currency: payload.currency,
      status: InvoiceStatus.Draft, lines: payload.lines,
    };
    this.items.set(invoice.id, invoice);
    await this.persist(invoice);
    this.activityLogService.record('INVOICE_DRAFT_CREATED', { entityId: invoice.id, summary: `Invoice draft created for customer ${invoice.customerId}` });
    return invoice;
  }

  async send(id: string): Promise<InvoiceRecord> {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Draft) throw new Error('Invoice can only be sent from DRAFT');
    invoice.status = InvoiceStatus.Sent;
    await this.persist(invoice);
    this.activityLogService.record('INVOICE_SENT', { entityId: invoice.id, summary: `Invoice ${invoice.id} sent` });
    return invoice;
  }

  async pay(id: string): Promise<InvoiceRecord> {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Sent) throw new Error('Invoice can only be paid from SENT');
    invoice.status = InvoiceStatus.Paid;
    await this.persist(invoice);
    this.activityLogService.record('INVOICE_PAID', { entityId: invoice.id, summary: `Invoice ${invoice.id} paid` });
    return invoice;
  }

  async reverse(id: string, reason: string): Promise<InvoiceRecord> {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Sent && invoice.status !== InvoiceStatus.Paid)
      throw new Error('Storno is allowed only for SENT or PAID invoices');
    invoice.status = InvoiceStatus.Reverted;
    await this.persist(invoice);
    this.activityLogService.record('INVOICE_STORNO', { entityId: invoice.id, summary: `Invoice ${invoice.id} reverted. Reason: ${reason || 'n/a'}` });
    return invoice;
  }

  get(id: string): InvoiceRecord { return this.getById(id); }
  list(): InvoiceRecord[] { return Array.from(this.items.values()).sort((a, b) => a.issueDate > b.issueDate ? -1 : 1); }
  totalNetAmount(inv: InvoiceRecord): number { return inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0); }

  private getById(id: string): InvoiceRecord {
    const inv = this.items.get(id);
    if (!inv) throw new NotFoundException(`Invoice with id ${id} not found`);
    return inv;
  }
}
