import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TaxRuleService } from '../../domain/tax/tax-rule.service';
import {
  BillStatus,
  FaturaHyrese,
  FaturaHyreseProps
} from '../../domain/bills/fatura-hyrese.aggregate';
import { CreateBillDto } from './dto/create-bill.dto';
import { BillRepository } from '../../infrastructure/persistence/bills/bill.repository';
import { ActivityLogService } from '../operations/activity-log.service';
import { DomainEventBus } from '../events/domain-event.bus';

@Injectable()
export class BillService {
  constructor(
    private readonly taxRuleService: TaxRuleService,
    private readonly billRepository: BillRepository,
    private readonly activityLogService: ActivityLogService,
    private readonly domainEventBus: DomainEventBus
  ) {}

  async createBill(dto: CreateBillDto): Promise<FaturaHyrese> {
    const props: FaturaHyreseProps = {
      supplierId: dto.supplierId,
      issueDate: new Date(dto.issueDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      currency: dto.currency,
      lines: dto.lineItems.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxCategoryId: l.taxCategoryId
      }))
    };

    const bill = FaturaHyrese.createNew(props);
    await this.billRepository.save(bill);
    this.activityLogService.record('BILL_DRAFT_CREATED', {
      entityId: bill.id,
      summary: `Bill draft created for supplier ${bill.supplierId}`
    });
    return bill;
  }

  async postBill(id: string): Promise<FaturaHyrese> {
    const bill = await this.billRepository.findById(id);
    if (!bill) {
      throw new NotFoundException(`Bill with id ${id} not found`);
    }

    try {
      bill.post(this.taxRuleService);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Unable to post bill');
    }
    await this.billRepository.save(bill);
    this.activityLogService.record('BILL_POSTED', {
      entityId: bill.id,
      summary: `Bill ${bill.id} posted`
    });
    this.domainEventBus.publish({
      type: 'billPosted',
      billId: bill.id,
      supplierId: bill.supplierId,
      totalNetAmount: bill.totalNetAmount,
      date: new Date().toISOString(),
      originalReference: `Bill-${bill.id}`
    });
    return bill;
  }

  async reverseBill(id: string, reason: string): Promise<FaturaHyrese> {
    const bill = await this.billRepository.findById(id);
    if (!bill) {
      throw new NotFoundException(`Bill with id ${id} not found`);
    }

    try {
      bill.reverse();
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Unable to reverse bill');
    }
    await this.billRepository.save(bill);
    this.activityLogService.record('BILL_STORNO', {
      entityId: bill.id,
      summary: `Bill ${bill.id} reverted via storno. Reason: ${reason || 'n/a'}`
    });
    this.domainEventBus.publish({
      type: 'billRevertRequested',
      originalReference: `Bill-${bill.id}`,
      billId: bill.id,
      date: new Date().toISOString(),
      reason
    });
    return bill;
  }

  async getBill(id: string): Promise<FaturaHyrese> {
    const bill = await this.billRepository.findById(id);
    if (!bill) {
      throw new NotFoundException(`Bill with id ${id} not found`);
    }
    return bill;
  }

  async listBills(status?: BillStatus): Promise<FaturaHyrese[]> {
    if (status) {
      return this.billRepository.listByStatus(status);
    }
    return this.billRepository.list();
  }
}

