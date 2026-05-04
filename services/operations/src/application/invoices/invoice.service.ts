import { BadRequestException, Injectable, NotFoundException, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from '../operations/activity-log.service';
import { InvoiceOrmEntity } from '../../infrastructure/persistence/invoices/invoice.orm-entity';
import { CrossServiceEventPublisher } from '../../events/cross-service-event.publisher';
import { ComplianceClient } from '../../compliance/compliance.client';
import { InventoryService } from '../inventory/inventory.service';
import { IamTenantLookupService } from '../../integrations/iam-tenant.lookup';
import { EdiInboxService } from '../edi/edi-inbox.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';

export enum InvoiceStatus { Draft = 'DRAFT', Sent = 'SENT', Paid = 'PAID', Reversing = 'REVERSING', Reverted = 'REVERTED' }

export interface InvoiceLine { description: string; quantity: number; unitPrice: number; accountCode: string; isInventoryItem?: boolean; sku?: string; }

export interface InvoiceRecord {
  id: string; customerId: string; issueDate: string; dueDate?: string | null;
  currency: string; status: InvoiceStatus; lines: InvoiceLine[];
  receiverNui?: string | null;
  counterpartyEdiId?: string | null;
}

@Injectable()
export class InvoiceService implements OnModuleInit {
  private readonly items = new Map<string, InvoiceRecord>();
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }

  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly eventPublisher: CrossServiceEventPublisher,
    private readonly complianceClient: ComplianceClient,
    private readonly inventoryService: InventoryService,
    private readonly iamTenantLookup: IamTenantLookupService,
    private readonly ediInboxService: EdiInboxService,
    @Optional() @InjectRepository(InvoiceOrmEntity, 'operations')
    private readonly orm?: Repository<InvoiceOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
    for (const r of rows) {
      this.items.set(this.key(r.tenantId, r.id), {
        id: r.id, customerId: r.customerId, issueDate: r.issueDate,
        dueDate: r.dueDate, currency: r.currency,
        status: r.status as InvoiceStatus, lines: r.lines,
        receiverNui: r.receiverNui ?? null,
        counterpartyEdiId: r.counterpartyBillId ?? null,
      });
    }
  }

  private async persist(tenantId: string, inv: InvoiceRecord): Promise<void> {
    if (!this.orm) return;
    await this.orm.save({
      id: inv.id, tenantId, customerId: inv.customerId, issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? null, currency: inv.currency,
      status: inv.status, lines: inv.lines,
      receiverNui: inv.receiverNui?.trim() ? inv.receiverNui.trim().toUpperCase() : null,
      counterpartyBillId: inv.counterpartyEdiId ?? null,
    });
  }

  async createDraft(tenantId: string, payload: CreateInvoiceDto): Promise<InvoiceRecord> {
    const lines: InvoiceLine[] = (payload.lines || []).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      accountCode: (l.accountCode && String(l.accountCode).trim()) || '',
      isInventoryItem: Boolean(l.isInventoryItem),
      sku: l.sku,
    }));
    try {
      await this.complianceClient.validateOrThrow('invoice', {
        customerId: payload.customerId,
        issueDate: payload.issueDate,
        dueDate: payload.dueDate,
        currency: payload.currency,
        lines,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }
    if (!lines.length) throw new Error('At least one invoice line is required');
    const receiverNui = payload.receiverNui?.trim() ? payload.receiverNui.trim().toUpperCase() : null;
    if (receiverNui && !/^8\d{8}$/.test(receiverNui)) {
      throw new BadRequestException('Receiver NUI is invalid.');
    }
    const invoice: InvoiceRecord = {
      id: uuidv4(), customerId: payload.customerId, issueDate: payload.issueDate,
      dueDate: payload.dueDate ?? null, currency: payload.currency,
      status: InvoiceStatus.Draft, lines,
      receiverNui,
      counterpartyEdiId: null,
    };
    this.items.set(this.key(tenantId, invoice.id), invoice);
    await this.persist(tenantId, invoice);
    const total = this.totalNetAmount(invoice);
    await this.eventPublisher.publish({
      type: 'invoiceCreated',
      tenantId,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      totalNetAmount: total,
      date: new Date().toISOString(),
      originalReference: `Invoice-${invoice.id}`,
    });
    this.activityLogService.record(tenantId, 'INVOICE_DRAFT_CREATED', { entityId: invoice.id, summary: `Invoice draft created for customer ${invoice.customerId}` });
    return invoice;
  }

  async send(tenantId: string, id: string): Promise<InvoiceRecord> {
    const invoice = this.getById(tenantId, id);
    if (invoice.status !== InvoiceStatus.Draft) throw new BadRequestException('Invoice can only be sent from DRAFT');

    try {
      await this.complianceClient.validateOrThrow('invoice', {
        customerId: invoice.customerId,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        lines: invoice.lines,
      });
    } catch (e: any) { throw new BadRequestException(e.message); }

    // ── EDI delivery ─────────────────────────────────────────────
    const receiverNui = invoice.receiverNui?.trim().toUpperCase() || null;
    if (receiverNui) {
      if (!/^8\d{8}$/.test(receiverNui)) throw new BadRequestException('Receiver NUI stored on invoice is invalid.');

      const receiverTenantId = await this.iamTenantLookup.resolveTenantIdByNui(receiverNui);
      if (!receiverTenantId) {
        throw new BadRequestException(
          `No registered company found for receiver NUI "${receiverNui}". ` +
          'The recipient must have this NUI set on their account (at signup or under Profile → business).',
        );
      }
      if (receiverTenantId === tenantId) {
        throw new BadRequestException('Receiver NUI cannot be your own company.');
      }

      const total = this.totalNetAmount(invoice);
      const senderNui = await this.iamTenantLookup.resolveNuiByTenantId(tenantId) ?? 'UNKNOWN';
      const senderLabel = await this.iamTenantLookup.resolveTenantLabelById(tenantId);
      const ediItem = await this.ediInboxService.createInboxItem({
        receiverTenantId,
        senderTenantId: tenantId,
        senderNui,
        senderTenantName: senderLabel?.name ?? null,
        invoiceId: invoice.id,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate ?? null,
        currency: invoice.currency,
        totalNetAmount: total,
        lines: invoice.lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          accountCode: l.accountCode || undefined,
        })),
      });
      invoice.counterpartyEdiId = ediItem.id;
    }

    // ── Issuer inventory (ISSUE movements) ───────────────────────
    const inventoryLines = invoice.lines.filter(l => l.isInventoryItem);
    for (const l of inventoryLines) {
      if (!l.sku?.trim()) throw new BadRequestException('Inventory invoice line must include SKU.');
      await this.inventoryService.recordMovement(tenantId, {
        sku: l.sku.trim().toUpperCase(),
        description: l.description,
        type: 'ISSUE',
        quantity: l.quantity,
        note: `Auto from invoice ${invoice.id}`,
      });
    }

    invoice.status = InvoiceStatus.Sent;
    await this.persist(tenantId, invoice);
    this.activityLogService.record(tenantId, 'INVOICE_SENT', {
      entityId: invoice.id,
      summary: `Invoice ${invoice.id} sent${receiverNui ? ` → EDI to ${receiverNui}` : ''}`,
    });
    return invoice;
  }

  async pay(tenantId: string, id: string): Promise<InvoiceRecord> {
    const invoice = this.getById(tenantId, id);
    if (invoice.status !== InvoiceStatus.Sent) throw new Error('Invoice can only be paid from SENT');
    invoice.status = InvoiceStatus.Paid;
    await this.persist(tenantId, invoice);
    const total = this.totalNetAmount(invoice);
    await this.eventPublisher.publish({
      type: 'invoicePaid',
      tenantId,
      invoiceId: invoice.id,
      totalNetAmount: total,
      date: new Date().toISOString(),
      originalReference: `Invoice-${invoice.id}`,
    });
    this.activityLogService.record(tenantId, 'INVOICE_PAID', { entityId: invoice.id, summary: `Invoice ${invoice.id} paid` });
    return invoice;
  }

  async reverse(tenantId: string, id: string, reason: string): Promise<InvoiceRecord> {
    const invoice = this.getById(tenantId, id);
    if (invoice.status !== InvoiceStatus.Sent && invoice.status !== InvoiceStatus.Paid)
      throw new Error('Storno is allowed only for SENT or PAID invoices');
    // Saga step 1: commit REVERSING, then request Ledger to post the STORNO entry.
    invoice.status = InvoiceStatus.Reversing;
    await this.persist(tenantId, invoice);
    await this.eventPublisher.publish({
      type: 'invoiceRevertRequested',
      tenantId,
      invoiceId: invoice.id,
      date: new Date().toISOString(),
      originalReference: `Invoice-${invoice.id}`,
      reason,
    });
    this.activityLogService.record(tenantId, 'INVOICE_STORNO_REQUESTED', { entityId: invoice.id, summary: `Invoice ${invoice.id} reversal requested. Reason: ${reason || 'n/a'}` });
    return invoice;
  }

  /** Saga step 2 (success path): Ledger confirmed STORNO was posted → finalise as REVERTED. */
  async handleStornoPosted(tenantId: string, originalReference: string): Promise<void> {
    const invoiceId = originalReference.startsWith('Invoice-') ? originalReference.slice(8) : originalReference;
    const invoice = this.items.get(this.key(tenantId, invoiceId));
    if (!invoice || invoice.status !== InvoiceStatus.Reversing) return;
    invoice.status = InvoiceStatus.Reverted;
    await this.persist(tenantId, invoice);
    this.activityLogService.record(tenantId, 'INVOICE_STORNO_CONFIRMED', { entityId: invoice.id, summary: `Invoice ${invoice.id} storno confirmed by Ledger` });
  }

  /** Saga compensating transaction: Ledger could not post STORNO → roll invoice back to prior status. */
  async handleStornoFailed(tenantId: string, originalReference: string, error: string): Promise<void> {
    const invoiceId = originalReference.startsWith('Invoice-') ? originalReference.slice(8) : originalReference;
    const invoice = this.items.get(this.key(tenantId, invoiceId));
    if (!invoice || invoice.status !== InvoiceStatus.Reversing) return;
    // Restore to Sent (most likely prior state for a storno candidate)
    invoice.status = InvoiceStatus.Sent;
    await this.persist(tenantId, invoice);
    this.activityLogService.record(tenantId, 'INVOICE_STORNO_COMPENSATED', { entityId: invoice.id, summary: `Invoice ${invoice.id} reversal failed (${error}); rolled back to SENT` });
  }

  get(tenantId: string, id: string): InvoiceRecord { return this.getById(tenantId, id); }
  list(tenantId: string): InvoiceRecord[] {
    return Array.from(this.items.entries()).filter(([k]) => k.startsWith(`${tenantId}:`)).map(([, v]) => v).sort((a, b) => a.issueDate > b.issueDate ? -1 : 1);
  }
  totalNetAmount(inv: InvoiceRecord): number { return inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0); }

  private getById(tenantId: string, id: string): InvoiceRecord {
    const inv = this.items.get(this.key(tenantId, id));
    if (!inv) throw new NotFoundException(`Invoice with id ${id} not found`);
    return inv;
  }
}
