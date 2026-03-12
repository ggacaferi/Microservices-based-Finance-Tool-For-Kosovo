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
      const axios = (await import('axios')).default;
      const { data } = await axios.get(`${this.baseUrl}/api/v1/compliance/bundle`, { timeout: 5000 });

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
      return ['43', '31', '28', '08'].includes(id);
    }
    return this.taxRules.has(id);
  }

  assertAllValidTaxIds(ids: string[]): void {
    const invalid = ids.filter(id => !this.isValidTaxId(id));
    if (invalid.length > 0) {
      const allowed = this.taxRules.size > 0
        ? Array.from(this.taxRules.keys()).join(', ')
        : '43, 31, 28, 08';
      throw new Error(`Invalid TaxCategoryId values: ${invalid.join(', ')}. Allowed: ${allowed}`);
    }
  }

  isValidAccountCode(code: string): boolean {
    if (this.validAccountCodes.size === 0) return true; // graceful degradation
    return this.validAccountCodes.has(code);
  }

  getBundleVersion(): number { return this.bundleVersion; }
  getTaxRules(): TaxRule[]   { return Array.from(this.taxRules.values()); }
}
