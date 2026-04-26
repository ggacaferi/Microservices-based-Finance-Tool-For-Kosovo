import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  TaxCategory, AccountCode, ComplianceRule, ComplianceBundle,
  KOSOVO_TAX_CATEGORIES, KOSOVO_CHART_OF_ACCOUNTS, COMPLIANCE_RULES, ComplianceLang,
  localizeTaxCategory, localizeAccount, localizeRule,
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

  private lang(l?: string): ComplianceLang { return (String(l || 'en').toLowerCase() === 'sq' ? 'sq' : 'en'); }

  getTaxCategories(lang?: string): TaxCategory[]            { return this.taxCategories.map(t => localizeTaxCategory(t, this.lang(lang))); }
  getAccount(code: string): AccountCode | undefined          { return this.chartOfAccounts.find(a => a.code === code); }
  getAccountsByType(type: AccountCode['type'], lang?: string): AccountCode[]{ return this.chartOfAccounts.filter(a => a.type === type).map(a => localizeAccount(a, this.lang(lang))); }
  getChartOfAccounts(lang?: string): AccountCode[]           { return this.chartOfAccounts.map(a => localizeAccount(a, this.lang(lang))); }
  getTaxCategory(id: string): TaxCategory | undefined        { return this.taxCategories.find(t => t.id === id); }
  getAccountByCode(code: string): AccountCode | undefined    { return this.chartOfAccounts.find(a => a.code === code); }
  isLeafAccount(code: string): boolean                       { return !this.chartOfAccounts.some(a => a.parentCode === code); }
  getRules(context?: string, lang?: string): ComplianceRule[] {
    const filtered = context ? this.rules.filter(r => r.context === context) : this.rules;
    return filtered.map(r => localizeRule(r, this.lang(lang)));
  }

  getBundle(lang?: string): ComplianceBundle {
    const l = this.lang(lang);
    return {
      version: this.version,
      lastRefreshed: this.lastRefreshed,
      taxCategories: this.taxCategories.map(t => localizeTaxCategory(t, l)),
      chartOfAccounts: this.chartOfAccounts.map(a => localizeAccount(a, l)),
      rules: this.rules.map(r => localizeRule(r, l)),
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

  validate(context: string, payload: any): { valid: boolean; violations: Array<{ code: string; field: string; message: string; legalBasis: string }> } {
    const violations: Array<{ code: string; field: string; message: string; legalBasis: string }> = [];

    const add = (code: string, field: string, message: string, legalBasis: string) => {
      violations.push({ code, field, message, legalBasis });
    };

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const containsPersonalData = (text: string): boolean => {
      if (!text) return false;
      if (UUID_RE.test(text.trim())) return false; // system UUIDs are not personal data
      const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
      const phone = /\+?\d[\d\s-]{7,}\d/;
      const personalNo = /\b\d{10}\b/;
      const cardLike = /\b\d{13,19}\b/;
      return email.test(text) || phone.test(text) || personalNo.test(text) || cardLike.test(text);
    };

    const isFutureDate = (d: string): boolean => {
      if (!d) return false;
      const dt = new Date(d);
      const now = new Date();
      return dt.getTime() > now.getTime() + 24 * 60 * 60 * 1000;
    };

    if (context === 'bill') {
      if ((payload.currency || '').toUpperCase() !== 'EUR') {
        add('KOS-VAL-001', 'currency', 'Business documents for Kosovo reporting must be in EUR.', 'Kosovo reporting practice / TAK filing currency');
      }
      if (isFutureDate(payload.issueDate)) {
        add('KOS-VAL-002', 'issueDate', 'Issue date cannot be in the future.', 'Sound accounting period recognition');
      }
      if (payload.dueDate && new Date(payload.dueDate) < new Date(payload.issueDate)) {
        add('KOS-VAL-003', 'dueDate', 'Due date cannot be earlier than issue date.', 'Commercial document integrity');
      }
      const lines = payload.lineItems || payload.lines || [];
      if (!Array.isArray(lines) || lines.length === 0) {
        add('KOS-VAL-004', 'lineItems', 'At least one line item is required.', 'Tax base must be determinable');
      }
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!this.getTaxCategory(String(l.taxCategoryId || ''))) {
          add('KOS-VAT-001', `lineItems[${i}].taxCategoryId`, 'Invalid Kosovo VAT category id.', 'Law 06/L-032');
        }
        if (Number(l.quantity) <= 0) {
          add('KOS-MATH-001', `lineItems[${i}].quantity`, 'Quantity must be greater than zero.', 'Arithmetic correctness of tax base');
        }
        if (Number(l.unitPrice) < 0) {
          add('KOS-MATH-002', `lineItems[${i}].unitPrice`, 'Unit price cannot be negative.', 'Arithmetic correctness of tax base');
        }
        if (containsPersonalData(String(l.description || ''))) {
          add('GDPR-001', `lineItems[${i}].description`, 'Description appears to contain personal data (email/phone/ID/card-like value).', 'GDPR principles: data minimization & purpose limitation');
        }
        const accountCode = String(l.accountCode || '');
        const acc = this.getAccountByCode(accountCode);
        if (!acc) {
          add('KOS-ACC-001', `lineItems[${i}].accountCode`, 'Invalid account code.', 'Kosovo chart of accounts policy');
        } else if (!this.isLeafAccount(acc.code)) {
          add('KOS-ACC-002', `lineItems[${i}].accountCode`, 'Main category is not allowed. Choose a sub-category (leaf account).', 'Internal control: posting only to leaf accounts');
        } else if (acc.type !== 'EXPENSE') {
          add('KOS-ACC-003', `lineItems[${i}].accountCode`, 'Bill lines must use EXPENSE accounts.', 'Double-entry classification policy');
        }
      }
      if (containsPersonalData(String(payload.supplierId || ''))) {
        add('GDPR-002', 'supplierId', 'Supplier identifier should not contain personal data patterns.', 'GDPR principles: data minimization');
      }
    }

    if (context === 'invoice') {
      if ((payload.currency || '').toUpperCase() !== 'EUR') {
        add('KOS-VAL-001', 'currency', 'Business documents for Kosovo reporting must be in EUR.', 'Kosovo reporting practice / TAK filing currency');
      }
      if (isFutureDate(payload.issueDate)) {
        add('KOS-VAL-002', 'issueDate', 'Issue date cannot be in the future.', 'Sound accounting period recognition');
      }
      if (payload.dueDate && new Date(payload.dueDate) < new Date(payload.issueDate)) {
        add('KOS-VAL-003', 'dueDate', 'Due date cannot be earlier than issue date.', 'Commercial document integrity');
      }
      const lines = payload.lines || [];
      if (!Array.isArray(lines) || lines.length === 0) {
        add('KOS-VAL-004', 'lines', 'At least one line is required.', 'Tax base must be determinable');
      }
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (Number(l.quantity) <= 0) add('KOS-MATH-001', `lines[${i}].quantity`, 'Quantity must be greater than zero.', 'Arithmetic correctness of tax base');
        if (Number(l.unitPrice) < 0) add('KOS-MATH-002', `lines[${i}].unitPrice`, 'Unit price cannot be negative.', 'Arithmetic correctness of tax base');
        if (containsPersonalData(String(l.description || ''))) {
          add('GDPR-001', `lines[${i}].description`, 'Description appears to contain personal data (email/phone/ID/card-like value).', 'GDPR principles: data minimization & purpose limitation');
        }
      }
      if (containsPersonalData(String(payload.customerId || ''))) {
        add('GDPR-003', 'customerId', 'Customer identifier should not contain personal data patterns.', 'GDPR principles: data minimization');
      }
    }

    if (context === 'inventory') {
      if (Number(payload.quantity) <= 0) add('KOS-MATH-001', 'quantity', 'Quantity must be greater than zero.', 'Arithmetic correctness of stock valuation');
      if (payload.unitCost !== undefined && Number(payload.unitCost) < 0) add('KOS-MATH-003', 'unitCost', 'Unit cost cannot be negative.', 'Arithmetic correctness of stock valuation');
      if (containsPersonalData(String(payload.description || '')) || containsPersonalData(String(payload.note || ''))) {
        add('GDPR-004', 'description/note', 'Inventory text fields appear to contain personal data.', 'GDPR principles: data minimization & purpose limitation');
      }
    }

    return { valid: violations.length === 0, violations };
  }
}
