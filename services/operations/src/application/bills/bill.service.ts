import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplianceClient } from '../../compliance/compliance.client';
import { BillStatus, FaturaHyrese } from '../../domain/bills/fatura-hyrese.aggregate';
import { BillRepository } from '../../infrastructure/bill.repository';
import { ActivityLogService } from '../operations/activity-log.service';
import { CrossServiceEventPublisher } from '../../events/cross-service-event.publisher';

export interface CreateBillInput {
  supplierId: string; issueDate: string; dueDate?: string; currency: string;
  lineItems: { description: string; quantity: number; unitPrice: number; taxCategoryId: string }[];
}

@Injectable()
export class BillService {
  constructor(
    private readonly complianceClient: ComplianceClient,
    private readonly billRepo: BillRepository,
    private readonly activityLog: ActivityLogService,
    private readonly eventPublisher: CrossServiceEventPublisher,
  ) {}

  async createBill(input: CreateBillInput): Promise<FaturaHyrese> {
    const bill = FaturaHyrese.createNew({
      supplierId: input.supplierId,
      issueDate: new Date(input.issueDate),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      currency: input.currency,
      lines: input.lineItems.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId })),
    });
    await this.billRepo.save(bill);
    this.activityLog.record('BILL_DRAFT_CREATED', { entityId: bill.id, summary: `Bill draft created for supplier ${bill.supplierId}` });
    return bill;
  }

  async postBill(id: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(id);
    try { bill.post(this.complianceClient); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.billRepo.save(bill);
    this.activityLog.record('BILL_POSTED', { entityId: bill.id, summary: `Bill ${bill.id} posted` });
    await this.eventPublisher.publish({ type: 'billPosted', billId: bill.id, supplierId: bill.supplierId, totalNetAmount: bill.totalNetAmount, date: new Date().toISOString(), originalReference: `Bill-${bill.id}` });
    return bill;
  }

  async reverseBill(id: string, reason: string): Promise<FaturaHyrese> {
    const bill = await this.findOrFail(id);
    try { bill.reverse(); } catch (e: any) { throw new BadRequestException(e.message); }
    await this.billRepo.save(bill);
    this.activityLog.record('BILL_STORNO', { entityId: bill.id, summary: `Bill ${bill.id} reverted. Reason: ${reason || 'n/a'}` });
    await this.eventPublisher.publish({ type: 'billReverted', billId: bill.id, originalReference: `Bill-${bill.id}`, date: new Date().toISOString(), reason });
    return bill;
  }

  async getBill(id: string): Promise<FaturaHyrese>                   { return this.findOrFail(id); }
  async listBills(status?: BillStatus): Promise<FaturaHyrese[]>       { return status ? this.billRepo.listByStatus(status) : this.billRepo.list(); }

  private async findOrFail(id: string): Promise<FaturaHyrese> {
    const bill = await this.billRepo.findById(id);
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    return bill;
  }
}
