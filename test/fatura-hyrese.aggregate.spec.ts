import { ComplianceService } from '../src/compliance/application/compliance.service';
import { TaxRuleService } from '../src/domain/tax/tax-rule.service';
import {
  BillStatus,
  BillLine,
  FaturaHyrese,
} from '../src/domain/bills/fatura-hyrese.aggregate';

describe('FaturaHyrese aggregate', () => {
  let tax: TaxRuleService;

  beforeEach(() => {
    const compliance = new ComplianceService();
    compliance.onModuleInit();
    tax = new TaxRuleService(compliance);
    tax.onModuleInit();
  });

  it('validates constructor rules', () => {
    expect(() =>
      FaturaHyrese.createNew({
        supplierId: ' ',
        issueDate: new Date(),
        currency: 'EUR',
        lines: [{ description: 'x', quantity: 1, unitPrice: 1, taxCategoryId: '43' }],
      }),
    ).toThrow(/SupplierId/);

    expect(() =>
      FaturaHyrese.createNew({
        supplierId: 'S',
        issueDate: null as any,
        currency: 'EUR',
        lines: [{ description: 'x', quantity: 1, unitPrice: 1, taxCategoryId: '43' }],
      }),
    ).toThrow(/Issue date/);

    expect(() =>
      FaturaHyrese.createNew({
        supplierId: 'S',
        issueDate: new Date(),
        currency: ' ',
        lines: [{ description: 'x', quantity: 1, unitPrice: 1, taxCategoryId: '43' }],
      }),
    ).toThrow(/Currency/);

    expect(() =>
      FaturaHyrese.createNew({
        supplierId: 'S',
        issueDate: new Date(),
        currency: 'EUR',
        lines: [],
      }),
    ).toThrow(/At least one bill line/);
  });

  it('BillLine validation', () => {
    expect(() =>
      new BillLine({
        description: ' ',
        quantity: 1,
        unitPrice: 1,
        taxCategoryId: '43',
      }),
    ).toThrow(/description/);

    expect(() =>
      new BillLine({
        description: 'ok',
        quantity: 0,
        unitPrice: 1,
        taxCategoryId: '43',
      }),
    ).toThrow(/quantity/);

    expect(() =>
      new BillLine({
        description: 'ok',
        quantity: 1,
        unitPrice: -1,
        taxCategoryId: '43',
      }),
    ).toThrow(/unit price/);
  });

  it('post, reverse, addLine, and alias Post', () => {
    const bill = FaturaHyrese.createNew({
      supplierId: 'S1',
      issueDate: new Date(),
      currency: 'EUR',
      lines: [{ description: 'L1', quantity: 1, unitPrice: 10, taxCategoryId: '43' }],
    });
    bill.addLine({ description: 'L2', quantity: 2, unitPrice: 5, taxCategoryId: '43' });
    expect(bill.lines.length).toBe(2);

    bill.post(tax);
    expect(bill.status).toBe(BillStatus.Posted);

    expect(() => bill.addLine({ description: 'x', quantity: 1, unitPrice: 1, taxCategoryId: '43' })).toThrow(
      /Cannot modify a posted bill/,
    );

    bill.reverse();
    expect(bill.status).toBe(BillStatus.Reverted);

    expect(() => bill.reverse()).toThrow(/only allowed for Posted/);
  });

  it('rehydrate and doPost guards', () => {
    const draft = FaturaHyrese.createNew({
      supplierId: 'S1',
      issueDate: new Date(),
      currency: 'EUR',
      lines: [{ description: 'L1', quantity: 1, unitPrice: 10, taxCategoryId: '43' }],
    });
    const posted = FaturaHyrese.rehydrate(
      draft.id,
      {
        supplierId: draft.supplierId,
        issueDate: draft.issueDate,
        dueDate: draft.dueDate,
        currency: draft.currency,
        lines: [{ description: 'L1', quantity: 1, unitPrice: 10, taxCategoryId: '43' }],
      },
      BillStatus.Posted,
    );
    expect(() => posted.post(tax)).toThrow(/only be posted from Draft/);
    expect(() => posted.Post(tax)).toThrow(/only be posted from Draft/);
  });
});
