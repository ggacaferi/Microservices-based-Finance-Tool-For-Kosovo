import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  TaxCategory,
  AccountCode,
  ComplianceRule,
  ComplianceBundle,
  IComplianceSubscriber,
  KOSOVO_TAX_CATEGORIES,
  KOSOVO_CHART_OF_ACCOUNTS,
  COMPLIANCE_RULES,
} from '../domain/tax-taxonomy';

/**
 * Compliance Service — The Rule Distributor
 *
 * Holds the immutable Kosovo SKA and Tax Codes in an in-memory cache.
 * Other services (Operations, Ledger) consume these rules locally
 * and only refresh when legislation changes.
 *
 * This service does NOT validate every transaction synchronously.
 * Instead, it distributes rules on demand.
 */
@Injectable()
export class ComplianceService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceService.name);

  private taxCategories: TaxCategory[] = [];
  private chartOfAccounts: AccountCode[] = [];
  private rules: ComplianceRule[] = [];
  private lastRefreshed: string = '';
  private version = 0;

  /**
   * Services that want rule updates register here once at startup.
   * ComplianceService pushes a new bundle to every subscriber when
   * legislation changes — subscribers never need to poll.
   */
  private readonly subscribers: IComplianceSubscriber[] = [];

  onModuleInit() {
    this.refreshCache();
    this.logger.log(
      `Compliance cache initialized: ${this.taxCategories.length} tax categories, ` +
        `${this.chartOfAccounts.length} accounts, ${this.rules.length} rules (v${this.version})`,
    );
  }

  /**
   * Register a service as a rule subscriber.
   * The subscriber's onRulesUpdated() will be called immediately with the
   * current bundle so the service can populate its local cache on startup,
   * and again whenever legislation is refreshed.
   */
  registerSubscriber(subscriber: IComplianceSubscriber): void {
    this.subscribers.push(subscriber);
    // Immediately hydrate the new subscriber with the current bundle
    subscriber.onRulesUpdated(this.getDistributionBundle());
    this.logger.log(
      `Subscriber registered: ${subscriber.constructor.name} — pushed v${this.version} bundle`,
    );
  }

  /**
   * Reload all legislative data (called on startup or when laws change).
   * Pushes the updated bundle to every registered subscriber.
   */
  refreshCache(): void {
    this.taxCategories = [...KOSOVO_TAX_CATEGORIES];
    this.chartOfAccounts = [...KOSOVO_CHART_OF_ACCOUNTS];
    this.rules = [...COMPLIANCE_RULES];
    this.version++;
    this.lastRefreshed = new Date().toISOString();

    if (this.subscribers.length > 0) {
      const bundle = this.getDistributionBundle();
      for (const subscriber of this.subscribers) {
        try {
          subscriber.onRulesUpdated(bundle);
        } catch (err: any) {
          this.logger.error(
            `Failed to push rule update to ${subscriber.constructor.name}: ${err.message}`,
          );
        }
      }
      this.logger.log(
        `Rule update v${this.version} pushed to ${this.subscribers.length} subscriber(s)`,
      );
    }
  }

  // ── Tax Categories ──────────────────────────────────────

  getTaxCategories(): TaxCategory[] {
    return this.taxCategories;
  }

  getTaxCategory(id: string): TaxCategory | undefined {
    return this.taxCategories.find((t) => t.id === id);
  }

  validateTaxCategoryIds(ids: string[]): { valid: boolean; invalid: string[] } {
    const validIds = new Set(this.taxCategories.map((t) => t.id));
    const invalid = ids.filter((id) => !validIds.has(id));
    return { valid: invalid.length === 0, invalid };
  }

  // ── Chart of Accounts (SKA) ─────────────────────────────

  getChartOfAccounts(): AccountCode[] {
    return this.chartOfAccounts;
  }

  getAccountsByType(type: AccountCode['type']): AccountCode[] {
    return this.chartOfAccounts.filter((a) => a.type === type);
  }

  getAccount(code: string): AccountCode | undefined {
    return this.chartOfAccounts.find((a) => a.code === code);
  }

  // ── Compliance Rules ────────────────────────────────────

  getRules(context?: string): ComplianceRule[] {
    if (context) return this.rules.filter((r) => r.context === context);
    return this.rules;
  }

  // ── Rule Distribution Bundle ────────────────────────────

  /**
   * Returns the full compliance bundle that other services
   * cache locally. Includes version for staleness detection.
   */
  getDistributionBundle(): ComplianceBundle {
    return {
      version: this.version,
      lastRefreshed: this.lastRefreshed,
      taxCategories: this.taxCategories,
      chartOfAccounts: this.chartOfAccounts,
      rules: this.rules,
    };
  }

  /**
   * Returns a summary for display
   */
  getSummary(): {
    version: number;
    lastRefreshed: string;
    taxCategoryCount: number;
    accountCount: number;
    ruleCount: number;
  } {
    return {
      version: this.version,
      lastRefreshed: this.lastRefreshed,
      taxCategoryCount: this.taxCategories.length,
      accountCount: this.chartOfAccounts.length,
      ruleCount: this.rules.length,
    };
  }
}
