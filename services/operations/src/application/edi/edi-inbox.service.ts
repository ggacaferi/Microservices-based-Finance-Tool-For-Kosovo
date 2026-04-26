import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EdiInboxOrmEntity, EdiInboxStatus } from '../../infrastructure/persistence/edi/edi-inbox.orm-entity';
import { BillService } from '../bills/bill.service';

const FALLBACK_ACCOUNT = '665-09'; // Kosovo SKA: "other office expense"

export interface EdiInboxItem {
  id: string;
  tenantId: string;
  senderTenantId: string;
  senderBusinessId: string;
  messageId: string;
  status: EdiInboxStatus;
  importedBillId: string | null;
  receivedAt: string;
  payload: {
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    totalNetAmount: number;
    /** Sender company name at send time (for receiver UI). */
    senderTenantName?: string | null;
    lines: Array<{ description: string; quantity: number; unitPrice: number; accountCode?: string }>;
  };
}

@Injectable()
export class EdiInboxService implements OnModuleInit {
  private readonly logger = new Logger(EdiInboxService.name);
  private readonly mem = new Map<string, EdiInboxItem>();

  constructor(
    private readonly billService: BillService,
    @Optional() @InjectRepository(EdiInboxOrmEntity, 'operations')
    private readonly orm?: Repository<EdiInboxOrmEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { receivedAt: 'DESC' } });
    for (const r of rows) {
      this.mem.set(`${r.tenantId}:${r.id}`, this.toItem(r));
    }
  }

  /**
   * Called by InvoiceService.send() when a receiverNui is resolved.
   * Creates an EDI inbox item for the RECEIVER tenant.
   */
  async createInboxItem(input: {
    receiverTenantId: string;
    senderTenantId: string;
    senderNui: string;
    senderTenantName?: string | null;
    invoiceId: string;
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    totalNetAmount: number;
    lines: Array<{ description: string; quantity: number; unitPrice: number; accountCode?: string }>;
  }): Promise<EdiInboxItem> {
    const item: EdiInboxItem = {
      id: uuidv4(),
      tenantId: input.receiverTenantId,
      senderTenantId: input.senderTenantId,
      senderBusinessId: input.senderNui,
      messageId: input.invoiceId,
      status: 'PENDING',
      importedBillId: null,
      receivedAt: new Date().toISOString(),
      payload: {
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        currency: input.currency,
        totalNetAmount: input.totalNetAmount,
        senderTenantName: input.senderTenantName?.trim() || null,
        lines: input.lines,
      },
    };

    this.mem.set(`${item.tenantId}:${item.id}`, item);

    if (this.orm) {
      await this.orm.save({
        id: item.id,
        tenantId: item.tenantId,
        senderTenantId: item.senderTenantId,
        senderBusinessId: item.senderBusinessId,
        messageId: item.messageId,
        status: item.status,
        importedBillId: null,
        payload: item.payload,
      });
    }

    this.logger.log(`EDI inbox item ${item.id} created for tenant ${item.tenantId} from ${item.senderBusinessId}`);
    return item;
  }

  /**
   * GET /edi/inbox — pending incoming EDI items only (accepted items are hidden).
   */
  async listForTenant(tenantId: string): Promise<EdiInboxItem[]> {
    if (this.orm) {
      const rows = await this.orm.find({
        where: { tenantId, status: 'PENDING' },
        order: { receivedAt: 'DESC' },
      });
      const items = rows.map(r => this.toItem(r));
      for (const item of items) {
        this.mem.set(`${item.tenantId}:${item.id}`, item);
      }
      return items;
    }
    return Array.from(this.mem.values())
      .filter(i => i.tenantId === tenantId && i.status === 'PENDING')
      .sort((a, b) => (a.receivedAt > b.receivedAt ? -1 : 1));
  }

  /**
   * POST /edi/inbox/:id/import-to-bill — accept EDI document and create a bill.
   */
  async importToBill(tenantId: string, inboxId: string): Promise<{ billId: string }> {
    const key = `${tenantId}:${inboxId}`;
    const item = this.mem.get(key);
    if (!item) {
      // try DB
      if (this.orm) {
        const row = await this.orm.findOneBy({ id: inboxId, tenantId });
        if (row) this.mem.set(key, this.toItem(row));
      }
    }
    const found = this.mem.get(key);
    if (!found) throw new NotFoundException(`EDI inbox item ${inboxId} not found`);
    if (found.status === 'IMPORTED') throw new BadRequestException('Already imported to bills');

    const bill = await this.billService.createBill(tenantId, {
      supplierId: found.senderTenantId,
      issueDate: found.payload.issueDate,
      dueDate: found.payload.dueDate ?? undefined,
      currency: found.payload.currency,
      lineItems: found.payload.lines.map(l => ({
        description: `[EDI] ${l.description}`,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxCategoryId: 'VAT-00-NO',
        accountCode: FALLBACK_ACCOUNT,
        isInventoryItem: false,
      })),
    });

    found.status = 'IMPORTED';
    found.importedBillId = bill.id;

    if (this.orm) {
      await this.orm.update({ id: inboxId, tenantId }, { status: 'IMPORTED', importedBillId: bill.id });
    }

    this.logger.log(`EDI item ${inboxId} imported as bill ${bill.id} for tenant ${tenantId}`);
    return { billId: bill.id };
  }

  private toItem(r: EdiInboxOrmEntity): EdiInboxItem {
    return {
      id: r.id,
      tenantId: r.tenantId,
      senderTenantId: r.senderTenantId,
      senderBusinessId: r.senderBusinessId,
      messageId: r.messageId,
      status: r.status,
      importedBillId: r.importedBillId,
      receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : String(r.receivedAt),
      payload: r.payload,
    };
  }
}
