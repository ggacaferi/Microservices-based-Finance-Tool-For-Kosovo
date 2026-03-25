import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface TaxRule {
  id: string;
  rate: number;
  description: string;
}

/**
 * ComplianceClient — Operations Service's gateway to the Compliance Service.
 *
 * Pattern: Pull-on-startup + polling refresh.
 * On startup, fetches the full compliance bundle via HTTP from the Compliance
 * Service and caches it locally. This means:
 *  - Operations NEVER calls Compliance per-transaction (zero synchronous coupling)
 *  - When Compliance publishes a new bundle version (law change), Operations
 *    detects it on the next poll and refreshes automatically.
 *
 * In a Pub/Sub deployment, Compliance would additionally push a
 * "compliance.rules.updated" event that triggers refreshBundle() immediately.
 */
@Injectable()
export class ComplianceClient implements OnModuleInit {
  private readonly logger = new Logger(ComplianceClient.name);
  private readonly baseUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';

  private taxRules = new Map<string, TaxRule>();
  private validAccountCodes = new Set<string>();
  private bundleVersion = 0;
  private refreshInterval?: NodeJS.Timeout;

  async onModuleInit(): Promise<void> {
    await this.refreshBundle();
    // Re-check every 60 s; only re-cache if version changed
    this.refreshInterval = setInterval(() => this.refreshBundle(), 60_000);
  }

  onModuleDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  /** Returns false when the Compliance Service is unreachable (graceful degradation) */
  async refreshBundle(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/compliance/bundle`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: any = await response.json();

      if (data.version === this.bundleVersion) return true; // nothing changed

      this.taxRules.clear();
      for (const cat of data.taxCategories ?? []) {
        this.taxRules.set(cat.id, { id: cat.id, rate: cat.rate, description: cat.description });
      }
      this.validAccountCodes.clear();
      for (const acc of data.chartOfAccounts ?? []) {
        this.validAccountCodes.add(acc.code);
      }

      this.bundleVersion = data.version;
      this.logger.log(`Compliance bundle refreshed to v${this.bundleVersion} — ${this.taxRules.size} tax categories, ${this.validAccountCodes.size} account codes`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Compliance Service unreachable (${err.message}). Using cached rules v${this.bundleVersion}.`);
      return false;
    }
  }

  isValidTaxId(id: string): boolean {
    if (this.taxRules.size === 0) {
      // Fallback: allow known Kosovo IDs so the service degrades gracefully
      return [
        'VAT-00-NO', 'VAT-00-BI', 'VAT-00-BII', 'VAT-00-BJZ', 'VAT-00-BIJZ',
        'VAT-IMP-18', 'VAT-IMP-08', 'VAT-IMPI-18', 'VAT-IMPI-08',
        '43', '08', 'VAT-BIV-18', 'VAT-BIV-08', 'VAT-RC-CREDIT-18', '28',
      ].includes(id);
    }
    return this.taxRules.has(id);
  }

  assertAllValidTaxIds(ids: string[]): void {
    const invalid = ids.filter(id => !this.isValidTaxId(id));
    if (invalid.length > 0) {
      const allowed = this.taxRules.size > 0
        ? Array.from(this.taxRules.keys()).join(', ')
        : 'VAT-00-NO, VAT-00-BI, VAT-00-BII, VAT-00-BJZ, VAT-00-BIJZ, VAT-IMP-18, VAT-IMP-08, VAT-IMPI-18, VAT-IMPI-08, 43, 08, VAT-BIV-18, VAT-BIV-08, VAT-RC-CREDIT-18, 28';
      throw new Error(`Invalid TaxCategoryId values: ${invalid.join(', ')}. Allowed: ${allowed}`);
    }
  }

  isValidAccountCode(code: string): boolean {
    if (this.validAccountCodes.size === 0) return true; // graceful degradation
    return this.validAccountCodes.has(code);
  }

  getBundleVersion(): number { return this.bundleVersion; }
  getTaxRules(): TaxRule[]   { return Array.from(this.taxRules.values()); }

  async validateOrThrow(context: 'bill' | 'invoice' | 'inventory', payload: any): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/compliance/validate?context=${context}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
      const data: any = await response.json();
      if (!data?.valid) {
        const violations = (data?.violations ?? []).map((v: any) => `${v.code}(${v.field}): ${v.message}`).join(' | ');
        throw new Error(`Compliance validation failed: ${violations}`);
      }
    } catch (err: any) {
      if (String(err?.message || '').includes('Compliance validation failed')) throw err;
      // If compliance endpoint is unreachable, fail closed for strict enforcement
      throw new Error(`Compliance Service unavailable for mandatory validation: ${err.message}`);
    }
  }
}
