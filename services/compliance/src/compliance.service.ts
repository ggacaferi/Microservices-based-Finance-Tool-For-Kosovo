import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  TaxCategory, AccountCode, ComplianceRule, ComplianceBundle,
  KOSOVO_TAX_CATEGORIES, KOSOVO_CHART_OF_ACCOUNTS, COMPLIANCE_RULES,
} from './tax-taxonomy';

@Injectable()
export class ComplianceService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceService.name);

  private taxCategories: TaxCategory[] = [];
  private chartOfAccounts: AccountCode[] = [];
  private rules: ComplianceRule[] = [];
  private lastRefreshed = '';
  private version = 0;

  onModuleInit() {
    this.refreshCache();
    this.logger.log(
      `Compliance cache: ${this.taxCategories.length} tax categories, ` +
      `${this.chartOfAccounts.length} accounts, ${this.rules.length} rules (v${this.version})`,
    );
  }

  refreshCache(): void {
    this.taxCategories    = [...KOSOVO_TAX_CATEGORIES];
    this.chartOfAccounts  = [...KOSOVO_CHART_OF_ACCOUNTS];
    this.rules            = [...COMPLIANCE_RULES];
    this.version++;
    this.lastRefreshed    = new Date().toISOString();
  }

  getTaxCategories(): TaxCategory[]                          { return this.taxCategories; }
  getAccount(code: string): AccountCode | undefined          { return this.chartOfAccounts.find(a => a.code === code); }
  getAccountsByType(type: AccountCode['type']): AccountCode[]{ return this.chartOfAccounts.filter(a => a.type === type); }
  getChartOfAccounts(): AccountCode[]                        { return this.chartOfAccounts; }
  getTaxCategory(id: string): TaxCategory | undefined        { return this.taxCategories.find(t => t.id === id); }
  getRules(context?: string): ComplianceRule[]               { return context ? this.rules.filter(r => r.context === context) : this.rules; }

  getBundle(): ComplianceBundle {
    return {
      version: this.version,
      lastRefreshed: this.lastRefreshed,
      taxCategories: this.taxCategories,
      chartOfAccounts: this.chartOfAccounts,
      rules: this.rules,
    };
  }

  getSummary() {
    return {
      version: this.version,
      lastRefreshed: this.lastRefreshed,
      taxCategoryCount: this.taxCategories.length,
      accountCount: this.chartOfAccounts.length,
      ruleCount: this.rules.length,
    };
  }
}
