import { ComplianceService } from '../src/compliance/application/compliance.service';
import { TaxRuleService } from '../src/domain/tax/tax-rule.service';

describe('TaxRuleService', () => {
  let tax: TaxRuleService;

  beforeEach(() => {
    const c = new ComplianceService();
    c.onModuleInit();
    tax = new TaxRuleService(c);
    tax.onModuleInit();
  });

  it('exposes rules and replaceRules', () => {
    expect(tax.getAll().length).toBeGreaterThan(0);
    expect(tax.getById('43')).toBeDefined();
    expect(tax.isValidId('43')).toBe(true);
    expect(tax.isValidId('999')).toBe(false);

    tax.replaceRules([{ id: 'x', rate: 0, description: 'test' }]);
    expect(tax.getById('x')).toBeDefined();
    expect(tax.getById('43')).toBeUndefined();
  });
});
