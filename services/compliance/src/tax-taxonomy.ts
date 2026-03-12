/**
 * Compliance Bounded Context — Domain
 *
 * Immutable Kosovo SKA (Standard Chart of Accounts) taxonomy
 * and VAT category definitions from Law 06/L-032.
 * These are legislative facts, not user-mutable data.
 */

export interface TaxCategory {
  id: string;
  name: string;
  rate: number;
  description: string;
  legalBasis: string;
}

export interface AccountCode {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
  description: string;
}

export interface ComplianceRule {
  id: string;
  context: string;
  rule: string;
  description: string;
  enforcedSince: string;
}

/** Bundle pushed to subscriber services (or fetched on startup via HTTP) */
export interface ComplianceBundle {
  version: number;
  lastRefreshed: string;
  taxCategories: TaxCategory[];
  chartOfAccounts: AccountCode[];
  rules: ComplianceRule[];
}

export const KOSOVO_TAX_CATEGORIES: TaxCategory[] = [
  { id: '43', name: 'Standard VAT Rate',             rate: 0.18, description: 'Standard 18% VAT rate for taxable supplies in Kosovo',           legalBasis: 'Law 06/L-032, Article 27'    },
  { id: '31', name: 'Exempt from VAT',                rate: 0,    description: 'Goods and services exempt from VAT under specific provisions',   legalBasis: 'Law 06/L-032, Article 28'    },
  { id: '28', name: 'Reverse Charge',                 rate: 0,    description: 'VAT reverse charge mechanism for cross-border B2B transactions', legalBasis: 'Law 06/L-032, Article 30'    },
  { id: '08', name: 'Reduced VAT Rate',               rate: 0.08, description: 'Reduced 8% VAT rate for essential goods',                        legalBasis: 'Law 06/L-032, Article 27(2)' },
];

export const KOSOVO_CHART_OF_ACCOUNTS: AccountCode[] = [
  { code: '1000', name: 'Cash and Cash Equivalents', type: 'ASSET',     description: 'Cash on hand and bank deposits'                },
  { code: '1100', name: 'Accounts Receivable',        type: 'ASSET',     description: 'Trade receivables from customers'               },
  { code: '1200', name: 'Inventory',                  type: 'ASSET',     description: 'Raw materials, WIP, finished goods'             },
  { code: '1300', name: 'Prepaid Expenses',           type: 'ASSET',     description: 'Expenses paid in advance'                       },
  { code: '1500', name: 'Fixed Assets',               type: 'ASSET',     description: 'Property, plant, and equipment'                 },
  { code: '2000', name: 'Accounts Payable',           type: 'LIABILITY', description: 'Trade payables to suppliers'                    },
  { code: '2100', name: 'VAT Payable',                type: 'LIABILITY', description: 'VAT owed to Kosovo Tax Administration'          },
  { code: '2200', name: 'Accrued Expenses',           type: 'LIABILITY', description: 'Expenses incurred but not yet paid'             },
  { code: '2500', name: 'Long-term Liabilities',      type: 'LIABILITY', description: 'Loans and long-term obligations'                },
  { code: '3000', name: "Owner's Equity",             type: 'EQUITY',    description: 'Owner capital and retained earnings'            },
  { code: '3100', name: 'Retained Earnings',          type: 'EQUITY',    description: 'Accumulated profits'                            },
  { code: '4000', name: 'Sales Revenue',              type: 'REVENUE',   description: 'Revenue from primary business activities'       },
  { code: '4100', name: 'Service Revenue',            type: 'REVENUE',   description: 'Revenue from services rendered'                 },
  { code: '4200', name: 'Other Income',               type: 'REVENUE',   description: 'Non-operating income'                          },
  { code: '5000', name: 'Cost of Goods Sold',         type: 'EXPENSE',   description: 'Direct costs attributable to goods sold'        },
  { code: '5100', name: 'Operating Expenses',         type: 'EXPENSE',   description: 'Salaries, rent, utilities, etc.'               },
  { code: '5200', name: 'Depreciation Expense',       type: 'EXPENSE',   description: 'Systematic allocation of asset costs'           },
  { code: '5300', name: 'Tax Expense',                type: 'EXPENSE',   description: 'Income tax and other taxes'                     },
];

export const COMPLIANCE_RULES: ComplianceRule[] = [
  { id: 'CR-001', context: 'bill',          rule: 'Every bill line must reference a valid Kosovo TAK tax category ID.',          description: 'Bills cannot be posted unless all lines carry a recognized tax category.', enforcedSince: '2025-01-01' },
  { id: 'CR-002', context: 'journal_entry', rule: 'Every journal entry must satisfy: sum(debits) === sum(credits).',             description: 'Double-entry bookkeeping invariant.',                                       enforcedSince: '2025-01-01' },
  { id: 'CR-003', context: 'bill',          rule: 'Storno is only permitted on POSTED bills.',                                    description: 'Prevents double-reversal.',                                                 enforcedSince: '2025-01-01' },
  { id: 'CR-004', context: 'invoice',       rule: 'Invoice status: DRAFT → SENT → PAID, reversal only from SENT or PAID.',      description: 'Invoice lifecycle cannot skip states.',                                     enforcedSince: '2025-01-01' },
  { id: 'CR-005', context: 'bill',          rule: 'Cross-border B2B purchases must use tax category 28 (Reverse Charge).',      description: 'Kosovo VAT law reverse charge requirement.',                                enforcedSince: '2025-01-01' },
];
