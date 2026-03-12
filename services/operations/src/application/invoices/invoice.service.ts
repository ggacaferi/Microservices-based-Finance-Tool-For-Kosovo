import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ActivityLogService } from '../operations/activity-log.service';

export enum InvoiceStatus {
  Draft = 'DRAFT',
  Sent = 'SENT',
  Paid = 'PAID',
  Reverted = 'REVERTED'
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceRecord {
  id: string;
  customerId: string;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
}

@Injectable()
export class InvoiceService {
  private readonly items = new Map<string, InvoiceRecord>();

  constructor(private readonly activityLogService: ActivityLogService) {}

  createDraft(payload: {
    customerId: string;
    issueDate: string;
    dueDate?: string;
    currency: string;
    lines: InvoiceLine[];
  }): InvoiceRecord {
    if (!payload.lines?.length) {
      throw new Error('At least one invoice line is required');
    }

    const invoice: InvoiceRecord = {
      id: uuidv4(),
      customerId: payload.customerId,
      issueDate: payload.issueDate,
      dueDate: payload.dueDate ?? null,
      currency: payload.currency,
      status: InvoiceStatus.Draft,
      lines: payload.lines
    };

    this.items.set(invoice.id, invoice);
    this.activityLogService.record('INVOICE_DRAFT_CREATED', {
      entityId: invoice.id,
      summary: `Invoice draft created for customer ${invoice.customerId}`
    });

    return invoice;
  }

  send(id: string): InvoiceRecord {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Draft) {
      throw new Error('Invoice can only be sent from DRAFT');
    }

    invoice.status = InvoiceStatus.Sent;
    this.activityLogService.record('INVOICE_SENT', {
      entityId: invoice.id,
      summary: `Invoice ${invoice.id} sent`
    });
    return invoice;
  }

  pay(id: string): InvoiceRecord {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Sent) {
      throw new Error('Invoice can only be paid from SENT');
    }

    invoice.status = InvoiceStatus.Paid;
    this.activityLogService.record('INVOICE_PAID', {
      entityId: invoice.id,
      summary: `Invoice ${invoice.id} paid`
    });
    return invoice;
  }

  reverse(id: string, reason: string): InvoiceRecord {
    const invoice = this.getById(id);
    if (invoice.status !== InvoiceStatus.Sent && invoice.status !== InvoiceStatus.Paid) {
      throw new Error('Storno is allowed only for SENT or PAID invoices');
    }

    invoice.status = InvoiceStatus.Reverted;
    this.activityLogService.record('INVOICE_STORNO', {
      entityId: invoice.id,
      summary: `Invoice ${invoice.id} reverted via storno. Reason: ${reason || 'n/a'}`
    });
    return invoice;
  }

  get(id: string): InvoiceRecord {
    return this.getById(id);
  }

  list(): InvoiceRecord[] {
    return Array.from(this.items.values()).sort((a, b) =>
      a.issueDate > b.issueDate ? -1 : 1
    );
  }

  totalNetAmount(invoice: InvoiceRecord): number {
    return invoice.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  }

  private getById(id: string): InvoiceRecord {
    const invoice = this.items.get(id);
    if (!invoice) {
      throw new NotFoundException(`Invoice with id ${id} not found`);
    }
    return invoice;
  }
}
