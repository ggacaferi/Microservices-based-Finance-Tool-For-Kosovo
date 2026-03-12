import { NotFoundException } from '@nestjs/common';
import { BillService } from '../src/application/bills/bill.service';
import { ActivityLogService } from '../src/application/operations/activity-log.service';
import { DomainEventBus } from '../src/application/events/domain-event.bus';
import { TaxRuleService } from '../src/domain/tax/tax-rule.service';
import { ComplianceService } from '../src/compliance/application/compliance.service';
import { BillStatus } from '../src/domain/bills/fatura-hyrese.aggregate';
import { BillRepository } from '../src/infrastructure/persistence/bills/bill.repository';

describe('BillService', () => {
  let service: BillService;

  beforeEach(() => {
    // Bootstrap ComplianceService (loads Kosovo rules into cache)
    const complianceService = new ComplianceService();
    complianceService.onModuleInit();

    // TaxRuleService registers as a subscriber and receives the initial bundle
    const taxRuleService = new TaxRuleService(complianceService);
    taxRuleService.onModuleInit();

    service = new BillService(
      taxRuleService,
      new BillRepository(),
      new ActivityLogService(),
      new DomainEventBus()
    );
  });

  it('creates a draft bill with computed totals', async () => {
    const bill = await service.createBill({
      supplierId: 'SUP-10',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Office chairs',
          quantity: 2,
          unitPrice: 75,
          taxCategoryId: '43'
        }
      ]
    });

    expect(bill.status).toBe(BillStatus.Draft);
    expect(bill.totalNetAmount).toBe(150);
  });

  it('posts and reverses a bill via storno', async () => {
    const bill = await service.createBill({
      supplierId: 'SUP-11',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Consulting',
          quantity: 1,
          unitPrice: 500,
          taxCategoryId: '43'
        }
      ]
    });

    const posted = await service.postBill(bill.id);
    expect(posted.status).toBe(BillStatus.Posted);

    const reversed = await service.reverseBill(bill.id, 'Wrong supplier');
    expect(reversed.status).toBe(BillStatus.Reverted);
  });

  it('rejects posting bill when tax category is invalid', async () => {
    const bill = await service.createBill({
      supplierId: 'SUP-12',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 25,
          taxCategoryId: '999'
        }
      ]
    });

    await expect(service.postBill(bill.id)).rejects.toThrow(
      /Invalid TaxCategoryId/
    );
  });

  it('lists bills by status filter', async () => {
    const draft = await service.createBill({
      supplierId: 'SUP-13',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Paper',
          quantity: 10,
          unitPrice: 2,
          taxCategoryId: '31'
        }
      ]
    });

    const posted = await service.createBill({
      supplierId: 'SUP-14',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Printer',
          quantity: 1,
          unitPrice: 300,
          taxCategoryId: '43'
        }
      ]
    });

    await service.postBill(posted.id);

    const drafts = await service.listBills(BillStatus.Draft);
    const postedOnly = await service.listBills(BillStatus.Posted);

    expect(drafts.some((x) => x.id === draft.id)).toBe(true);
    expect(postedOnly.some((x) => x.id === posted.id)).toBe(true);
  });

  it('throws NotFoundException for missing bill', async () => {
    await expect(service.getBill('missing-id')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
