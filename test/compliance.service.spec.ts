import { ComplianceService } from '../src/compliance/application/compliance.service';
import { ComplianceBundle, IComplianceSubscriber } from '../src/compliance/domain/tax-taxonomy';

describe('ComplianceService', () => {
  it('exposes taxonomy helpers and refresh pushes to subscribers', () => {
    const svc = new ComplianceService();
    svc.onModuleInit();

    expect(svc.getTaxCategories().length).toBeGreaterThan(0);
    expect(svc.getTaxCategory('43')).toBeDefined();
    expect(svc.validateTaxCategoryIds(['43', '999']).valid).toBe(false);

    expect(svc.getChartOfAccounts().length).toBeGreaterThan(0);
    expect(svc.getAccountsByType('ASSET').every((a) => a.type === 'ASSET')).toBe(true);

    expect(svc.getRules().length).toBeGreaterThan(0);
    const filtered = svc.getRules('bill');
    expect(filtered.every((r) => r.context === 'bill')).toBe(true);

    const bundle = svc.getDistributionBundle();
    expect(bundle.version).toBeGreaterThan(0);

    const received: ComplianceBundle[] = [];
    const sub: IComplianceSubscriber = {
      onRulesUpdated(b: ComplianceBundle) {
        received.push(b);
      },
    };
    svc.registerSubscriber(sub);
    expect(received.length).toBeGreaterThan(0);

    svc.refreshCache();
    expect(received.length).toBeGreaterThanOrEqual(2);
  });

  it('isolates subscriber failures during refresh', () => {
    const svc = new ComplianceService();
    svc.onModuleInit();
    let n = 0;
    svc.registerSubscriber({
      onRulesUpdated() {
        n += 1;
        if (n >= 2) throw new Error('boom');
      },
    });
    expect(() => svc.refreshCache()).not.toThrow();
  });
});
