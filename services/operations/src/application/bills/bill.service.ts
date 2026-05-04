import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceClient } from '../../compliance/compliance.client';
import { BillStatus, FaturaHyrese } from '../../domain/bills/fatura-hyrese.aggregate';
import { BillRepository } from '../../infrastructure/bill.repository';
import { ActivityLogService } from '../operations/activity-log.service';
import { CrossServiceEventPublisher } from '../../events/cross-service-event.publisher';
import { InventoryService } from '../inventory/inventory.service';

export interface CreateBillInput {
  supplierId: string; issueDate: string; dueDate?: string; currency: string;
  lineItems: { description: string; quantity: number; unitPrice: number; taxCategoryId: string; accountCode: string; isInventoryItem?: boolean; sku?: string }[];
}

@Injectable()
export class BillService {
  constructor(
    private readonly complianceClient: ComplianceClient,
    private readonly billRepo: BillRepository,
    private readonly activityLog: ActivityLogService,
    private readonly eventPublisher: CrossServiceEventPublisher,
    private readonly inventoryService: InventoryService,
  ) {}

  async createBill(tenantId: string, input: CreateBillInput): Promise<FaturaHyrese> {
    try { await this.complianceClient.validateOrThrow('bill', input); } catch (e: any) { throw new BadRequestException(e.message); }
    const bill = FaturaHyrese.createNew({
      supplierId: input.supplierId,
      issueDate: new Date(input.issueDate),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      currency: input.currency,
      lines: input.lineItems.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, accountCode: l.accountCode })),
    });
    await this.billRepo.save(tenantId, bill);

    const inventoryLines = input.lineItems.filter(l => l.isInventoryItem);
    for (const l of inventoryLines) {
      if (!l.sku?.trim()) throw new BadRequestException('Inventory line must include SKU.');
      await this.inventoryService.recordMovement(tenantId, {
        sku: l.sku.trim().toUpperCase(),
        description: l.description,
        type: 'RECEIPT',
        quantity: l.quantity,
        unitCost: l.unitPrice,
        note: `Auto from bill ${bill.id}`,
      });
    }

    this.activityLog.record(tenantId, 'BILL_DRAFT_CREATED', { entityId: bill.id, summary: `Bill draft created for supplier ${bill.supplierId}` });
    return bill;
  }

  async postBill(tenantId: string, id: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(tenantId, id);
    try { await this.complianceClient.validateOrThrow('bill', {
      supplierId: bill.supplierId,
      issueDate: bill.issueDate,
      dueDate: bill.dueDate,
      currency: bill.currency,
      lineItems: bill.lines.map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, accountCode: l.accountCode })),
    }); } catch (e: any) { throw new BadRequestException(e.message); }
    try { bill.post(this.complianceClient); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_POSTED', { entityId: bill.id, summary: `Bill ${bill.id} posted` });
    await this.eventPublisher.publish({ type: 'billPosted', tenantId, billId: bill.id, supplierId: bill.supplierId, totalNetAmount: bill.totalNetAmount, date: new Date().toISOString(), originalReference: `Bill-${bill.id}` });
    return bill;
  }

  async payBill(tenantId: string, id: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(tenantId, id);
    try { bill.pay(); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_PAID', { entityId: bill.id, summary: `Bill ${bill.id} paid` });
    await this.eventPublisher.publish({
      type: 'billPaid',
      tenantId,
      billId: bill.id,
      totalNetAmount: bill.totalNetAmount,
      date: new Date().toISOString(),
      originalReference: `Bill-${bill.id}`,
    });
    return bill;
  }

  async reverseBill(tenantId: string, id: string, reason: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(tenantId, id);
    try { bill.reverse(); } catch (e: any) { throw new BadRequestException(e.message); }
    // Saga step 1: commit REVERSING status, then fire-and-request to Ledger.
    // The bill stays REVERSING until Ledger replies with stornoPosted or stornoFailed.
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_STORNO_REQUESTED', { entityId: bill.id, summary: `Bill ${bill.id} reversal requested. Reason: ${reason || 'n/a'}` });
    await this.eventPublisher.publish({ type: 'billRevertRequested', tenantId, billId: bill.id, originalReference: `Bill-${bill.id}`, date: new Date().toISOString(), reason });
    return bill;
  }

  /** Saga step 2 (success path): called when Ledger confirms STORNO was posted. */
  async handleStornoPosted(tenantId: string, originalReference: string): Promise<void> {
    const billId = originalReference.startsWith('Bill-') ? originalReference.slice(5) : originalReference;
    const bill = await this.billRepo.findById(tenantId, billId);
    if (!bill) return;
    try { bill.confirmReversal(); } catch { return; }
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_STORNO_CONFIRMED', { entityId: bill.id, summary: `Bill ${bill.id} storno confirmed by Ledger` });
  }

  /** Saga compensating transaction: called when Ledger could not post STORNO → roll bill back to POSTED. */
  async handleStornoFailed(tenantId: string, originalReference: string, error: string): Promise<void> {
    const billId = originalReference.startsWith('Bill-') ? originalReference.slice(5) : originalReference;
    const bill = await this.billRepo.findById(tenantId, billId);
    if (!bill) return;
    try { bill.cancelReversal(); } catch { return; }
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_STORNO_COMPENSATED', { entityId: bill.id, summary: `Bill ${bill.id} reversal failed (${error}); rolled back to POSTED` });
  }

  async getBill(tenantId: string, id: string): Promise<FaturaHyrese>             { return this.findOrFail(tenantId, id); }
  async listBills(tenantId: string, status?: BillStatus): Promise<FaturaHyrese[]> { return status ? this.billRepo.listByStatus(tenantId, status) : this.billRepo.list(tenantId); }

  private async findOrFail(tenantId: string, id: string): Promise<FaturaHyrese> {
    const bill = await this.billRepo.findById(tenantId, id);
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    return bill;
  }
}
