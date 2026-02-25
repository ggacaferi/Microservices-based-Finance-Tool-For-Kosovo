import { Injectable, OnModuleInit } from '@nestjs/common';

// IDs aligned to Compliance "tax_definitions" JSON
export type TaxCategoryId = '43' | '31' | '28';

export interface TaxRule {
  id: TaxCategoryId;
  rate: number;
  description: string;
}

/**
 * Local cache of rules defined by the ComplianceService.
 * Loaded at startup (hardcoded for now).
 */
@Injectable()
export class TaxRuleService implements OnModuleInit {
  private readonly rules = new Map<TaxCategoryId, TaxRule>();

  onModuleInit(): void {
    const hardcoded: TaxRule[] = [
      { id: '43', rate: 0.18, description: 'Standard VAT' },
      { id: '31', rate: 0.0, description: 'Exempt (Blerjet pa TVSH)' },
      { id: '28', rate: 0.0, description: 'Reverse Charge (Ngarkesa e Kundërt)' }
    ];

    for (const rule of hardcoded) {
      this.rules.set(rule.id, rule);
    }
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

