import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceClient } from '../../compliance/compliance.client';
import { BillStatus, FaturaHyrese } from '../../domain/bills/fatura-hyrese.aggregate';
import { BillRepository } from '../../infrastructure/bill.repository';
import { ActivityLogService } from '../operations/activity-log.service';
import { CrossServiceEventPublisher } from '../../events/cross-service-event.publisher';

export interface CreateBillInput {
  supplierId: string; issueDate: string; dueDate?: string; currency: string;
  lineItems: { description: string; quantity: number; unitPrice: number; taxCategoryId: string; accountCode: string }[];
}

@Injectable()
export class BillService {
  constructor(
    private readonly complianceClient: ComplianceClient,
    private readonly billRepo: BillRepository,
    private readonly activityLog: ActivityLogService,
    private readonly eventPublisher: CrossServiceEventPublisher,
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

  async reverseBill(tenantId: string, id: string, reason: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(tenantId, id);
    try { bill.reverse(); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.billRepo.save(tenantId, bill);
    this.activityLog.record(tenantId, 'BILL_STORNO', { entityId: bill.id, summary: `Bill ${bill.id} reverted. Reason: ${reason || 'n/a'}` });
    await this.eventPublisher.publish({ type: 'billReverted', tenantId, billId: bill.id, originalReference: `Bill-${bill.id}`, date: new Date().toISOString(), reason });
    return bill;
  }

  async getBill(tenantId: string, id: string): Promise<FaturaHyrese>             { return this.findOrFail(tenantId, id); }
  async listBills(tenantId: string, status?: BillStatus): Promise<FaturaHyrese[]> { return status ? this.billRepo.listByStatus(tenantId, status) : this.billRepo.list(tenantId); }

  private async findOrFail(tenantId: string, id: string): Promise<FaturaHyrese> {
    const bill = await this.billRepo.findById(tenantId, id);
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    return bill;
  }
}
