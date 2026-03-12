import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ComplianceService } from '../../compliance/application/compliance.service';
import { ComplianceBundle, IComplianceSubscriber } from '../../compliance/domain/tax-taxonomy';

export type TaxCategoryId = string; // IDs sourced from ComplianceService (e.g. '43', '31', '28', '08')

export interface TaxRule {
  id: TaxCategoryId;
  rate: number;
  description: string;
}

/**
 * TaxRuleService — Operations BC's local rule cache.
 *
 * Pattern: Push-based Rule Distribution
 * - Fetches the full tax category bundle from ComplianceService ONCE at startup.
 * - Registers as an IComplianceSubscriber so ComplianceService pushes updates
 *   automatically whenever legislation changes (POST /compliance/refresh).
 * - All other services (BillService via FaturaHyrëse aggregate) call THIS service
 *   and never wait on ComplianceService per-transaction.
 */
@Injectable()
export class TaxRuleService implements OnModuleInit, IComplianceSubscriber {
  private readonly logger = new Logger(TaxRuleService.name);
  private readonly rules = new Map<TaxCategoryId, TaxRule>();

  constructor(private readonly complianceService: ComplianceService) {}

  onModuleInit(): void {
    // Register with ComplianceService — this also triggers an immediate
    // onRulesUpdated() call so the cache is populated before any request arrives.
    this.complianceService.registerSubscriber(this);
  }

  /**
   * Called by ComplianceService on startup AND whenever rules change.
   * Replaces the local cache atomically — zero downtime for in-flight requests.
   */
  onRulesUpdated(bundle: ComplianceBundle): void {
    this.rules.clear();
    for (const cat of bundle.taxCategories) {
      this.rules.set(cat.id, {
        id: cat.id,
        rate: cat.rate,
        description: cat.description,
      });
    }
    this.logger.log(
      `Local tax rule cache updated to v${bundle.version}: ${this.rules.size} categories loaded`,
    );
  }

  getAll(): TaxRule[] {
    return Array.from(this.rules.values());
  }

  getById(id: TaxCategoryId): TaxRule | undefined {
    return this.rules.get(id);
  }

  isValidId(id: string): id is TaxCategoryId {
    return this.rules.has(id as TaxCategoryId);
  }

  assertAllValid(ids: string[]): asserts ids is TaxCategoryId[] {
    const invalid = ids.filter((id) => !this.isValidId(id));
    if (invalid.length > 0) {
      const allowed = Array.from(this.rules.keys()).join(', ');
      throw new Error(
        `Invalid TaxCategoryId values: ${invalid.join(
          ', '
        )}. Allowed IDs: ${allowed}`
      );
    }
  }

  // For future: called when ComplianceService publishes updated rules.
  replaceRules(newRules: TaxRule[]): void {
    this.rules.clear();
    for (const rule of newRules) {
      this.rules.set(rule.id, rule);
    }
  }
}

