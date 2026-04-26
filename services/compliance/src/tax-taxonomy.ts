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

export type ComplianceLang = 'en' | 'sq';

export const KOSOVO_TAX_CATEGORIES: TaxCategory[] = [
  { id: 'VAT-00-NO', name: 'No VAT', rate: 0, description: 'No VAT (0%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-00-BI', name: 'Blerjet dhe importet pa TVSH', rate: 0, description: 'Blerjet dhe importet pa TVSH (0%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-00-BII', name: 'Blerjet dhe importet investive pa TVSH', rate: 0, description: 'Blerjet dhe importet investive pa TVSH (0%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-00-BJZ', name: 'Blerjet dhe importet me TVSH jo të zbritshme', rate: 0, description: 'Blerjet dhe importet me TVSH jo të zbritshme (0%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-00-BIJZ', name: 'Blerjet dhe importet investive me TVSH jo të zbritshme', rate: 0, description: 'Blerjet dhe importet investive me TVSH jo të zbritshme (0%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-IMP-18', name: 'Importet 18%', rate: 0.18, description: 'Importet 18% (18%)', legalBasis: 'Law 06/L-032, Article 27' },
  { id: 'VAT-IMP-08', name: 'Importet 8%', rate: 0.08, description: 'Importet 8% (8%)', legalBasis: 'Law 06/L-032, Article 27(2)' },
  { id: 'VAT-IMPI-18', name: 'Importet investive 18%', rate: 0.18, description: 'Importet investive 18% (18%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-IMPI-08', name: 'Importet investive 8%', rate: 0.08, description: 'Importet investive 8% (8%)', legalBasis: 'Law 06/L-032' },
  { id: '43', name: 'Blerjet vendore 18%', rate: 0.18, description: 'Blerjet vendore 18% (18%)', legalBasis: 'Law 06/L-032, Article 27' },
  { id: '08', name: 'Blerjet vendore 8%', rate: 0.08, description: 'Blerjet vendore 8% (8%)', legalBasis: 'Law 06/L-032, Article 27(2)' },
  { id: 'VAT-BIV-18', name: 'Blerjet investive vendore 18%', rate: 0.18, description: 'Blerjet investive vendore 18% (18%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-BIV-08', name: 'Blerjet investive vendore 8%', rate: 0.08, description: 'Blerjet investive vendore 8% (8%)', legalBasis: 'Law 06/L-032' },
  { id: 'VAT-RC-CREDIT-18', name: 'E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%', rate: 0.18, description: 'E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18% (18%)', legalBasis: 'Law 06/L-032, reverse charge' },
  { id: '28', name: 'Blerjet që i nënshtrohen ngarkesës së kundërt 18%', rate: 0, description: 'Blerjet që i nënshtrohen ngarkesës së kundërt 18% (0%)', legalBasis: 'Law 06/L-032, reverse charge' },
];

export const KOSOVO_CHART_OF_ACCOUNTS: AccountCode[] = [
  { code: '100', name: 'Paraja ne arke dhe banke', type: 'ASSET', description: 'Paraja ne arke dhe llogari bankare' },
  { code: '650', name: 'Akomodim', type: 'EXPENSE', description: 'Shpenzime akomodimi' },
  { code: '655', name: 'Shpenzime te tregtise', type: 'EXPENSE', description: 'Shpenzime te tregtise' },
  { code: '660', name: 'Shpenzime te personelit', type: 'EXPENSE', description: 'Shpenzime te personelit' },
  { code: '660-01', name: 'Paga bruto', type: 'EXPENSE', parentCode: '660', description: 'Paga bruto' },
  { code: '660-02', name: 'Sigurimi shendetesor', type: 'EXPENSE', parentCode: '660', description: 'Sigurimi shendetesor' },
  { code: '660-03', name: 'Kontributi pensional', type: 'EXPENSE', parentCode: '660', description: 'Kontributi pensional' },
  { code: '665', name: 'Shpenzimet e zyres', type: 'EXPENSE', description: 'Shpenzimet e zyres' },
  { code: '665-01', name: 'Shpenzimet e qirase', type: 'EXPENSE', parentCode: '665', description: 'Shpenzimet e qirase' },
  { code: '665-02', name: 'Material harxhues', type: 'EXPENSE', parentCode: '665', description: 'Material harxhues' },
  { code: '665-03', name: 'Pastrimi', type: 'EXPENSE', parentCode: '665', description: 'Pastrimi' },
  { code: '665-04', name: 'Ushqim dhe pije', type: 'EXPENSE', parentCode: '665', description: 'Ushqim dhe pije' },
  { code: '665-05', name: 'Shpenzime te IT-se', type: 'EXPENSE', parentCode: '665', description: 'Shpenzime te IT-se' },
  { code: '665-06', name: 'Shpezimet e perfaqesimit', type: 'EXPENSE', parentCode: '665', description: 'Shpezimet e perfaqesimit' },
  { code: '665-07', name: 'Asete nen 1000 euro', type: 'EXPENSE', parentCode: '665', description: 'Asete nen 1000 euro' },
  { code: '665-09', name: 'Te tjera', type: 'EXPENSE', parentCode: '665', description: 'Te tjera' },
  { code: '667', name: 'Sherbimet profesionale', type: 'EXPENSE', description: 'Sherbimet profesionale' },
  { code: '667-01', name: 'Sherbimet e kontabilitetit', type: 'EXPENSE', parentCode: '667', description: 'Sherbimet e kontabilitetit' },
  { code: '667-02', name: 'Sherbime ligjore', type: 'EXPENSE', parentCode: '667', description: 'Sherbime ligjore' },
  { code: '667-03', name: 'Sherbime konsulente', type: 'EXPENSE', parentCode: '667', description: 'Sherbime konsulente' },
  { code: '667-04', name: 'Sherbime auditimi', type: 'EXPENSE', parentCode: '667', description: 'Sherbime auditimi' },
  { code: '668', name: 'Shpenzimet e udhetimit', type: 'EXPENSE', description: 'Shpenzimet e udhetimit' },
  { code: '668-01', name: 'Akomodimi', type: 'EXPENSE', parentCode: '668', description: 'Akomodimi' },
  { code: '668-02', name: 'Meditja', type: 'EXPENSE', parentCode: '668', description: 'Meditja' },
  { code: '668-03', name: 'Transporti', type: 'EXPENSE', parentCode: '668', description: 'Transporti' },
  { code: '669', name: 'Shpenzimet e automjetit', type: 'EXPENSE', description: 'Shpenzimet e automjetit' },
  { code: '669-01', name: 'Shpenzimet e karburantit', type: 'EXPENSE', parentCode: '669', description: 'Shpenzimet e karburantit' },
  { code: '669-02', name: 'Mirembajtje dhe riparim', type: 'EXPENSE', parentCode: '669', description: 'Mirembajtje dhe riparim' },
  { code: '675', name: 'Shpenzimet e komunikimit', type: 'EXPENSE', description: 'Shpenzimet e komunikimit' },
  { code: '675-01', name: 'Interneti', type: 'EXPENSE', parentCode: '675', description: 'Interneti' },
  { code: '675-02', name: 'Telefon mobil', type: 'EXPENSE', parentCode: '675', description: 'Telefon mobil' },
  { code: '675-03', name: 'Dergesa postare', type: 'EXPENSE', parentCode: '675', description: 'Dergesa postare' },
  { code: '675-04', name: 'Teleon fiks', type: 'EXPENSE', parentCode: '675', description: 'Teleon fiks' },
  { code: '683', name: 'Shpenzimet e sigurimit', type: 'EXPENSE', description: 'Shpenzimet e sigurimit' },
  { code: '683-01', name: 'Sigurimi i automjeteve', type: 'EXPENSE', parentCode: '683', description: 'Sigurimi i automjeteve' },
  { code: '683-02', name: 'Sigurimi i nderteses', type: 'EXPENSE', parentCode: '683', description: 'Sigurimi i nderteses' },
  { code: '686', name: 'Komunalite', type: 'EXPENSE', description: 'Komunalite' },
  { code: '686-01', name: 'Energjia elektrike', type: 'EXPENSE', parentCode: '686', description: 'Energjia elektrike' },
  { code: '686-02', name: 'Ujesjellesi', type: 'EXPENSE', parentCode: '686', description: 'Ujesjellesi' },
  { code: '686-03', name: 'Pastrimi', type: 'EXPENSE', parentCode: '686', description: 'Pastrimi' },
  { code: '686-04', name: 'Shpenzimet e ngrohjes', type: 'EXPENSE', parentCode: '686', description: 'Shpenzimet e ngrohjes' },
  { code: '690', name: 'Shpenzimet tjera operative', type: 'EXPENSE', description: 'Shpenzimet tjera operative' },
  { code: '690-01', name: 'Shpenzimet e anetaresimit', type: 'EXPENSE', parentCode: '690', description: 'Shpenzimet e anetaresimit' },
  { code: '690-02', name: 'Shpenzimet e perkthimit', type: 'EXPENSE', parentCode: '690', description: 'Shpenzimet e perkthimit' },
  { code: '690-03', name: 'Provizion bankar', type: 'EXPENSE', parentCode: '690', description: 'Provizion bankar' },
  { code: '690-04', name: 'Mirembajtje e webfaqes', type: 'EXPENSE', parentCode: '690', description: 'Mirembajtje e webfaqes' },
  { code: '690-05', name: 'Taksa komunale', type: 'EXPENSE', parentCode: '690', description: 'Taksa komunale' },
  { code: '690-06', name: 'Mirembajtje e llogarise bankare', type: 'EXPENSE', parentCode: '690', description: 'Mirembajtje e llogarise bankare' },
  { code: '240', name: 'Obligimet e pagave', type: 'LIABILITY', description: 'Obligimet e pagave' },
  { code: '220', name: 'Detyrime ndaj furnitoreve', type: 'LIABILITY', description: 'Detyrime tregtare ndaj furnitoreve' },
  { code: '240-01', name: 'Paga neto', type: 'LIABILITY', parentCode: '240', description: 'Paga neto' },
  { code: '240-02', name: 'Kontributi pensional', type: 'LIABILITY', parentCode: '240', description: 'Kontributi pensional' },
  { code: '240-03', name: 'Tatimi ne te ardhura pesonale', type: 'LIABILITY', parentCode: '240', description: 'Tatimi ne te ardhura pesonale' },
  { code: '240-04', name: 'Sigurimi Shendetsor', type: 'LIABILITY', parentCode: '240', description: 'Sigurimi Shendetsor' },
  { code: '250', name: 'TVSH e pagueshme', type: 'LIABILITY', description: 'TVSH e pagueshme' },
  { code: '256', name: 'Obligim ngarkesa e kundert 18%', type: 'LIABILITY', description: 'Obligim ngarkesa e kundert 18%' },
  { code: '280', name: 'Huazime nga Pronari', type: 'LIABILITY', description: 'Huazime nga Pronari' },
  { code: '290', name: 'Detyrimet e importit', type: 'LIABILITY', description: 'Detyrimet e importit' },
  { code: '290-01', name: 'Transporti', type: 'LIABILITY', parentCode: '290', description: 'Transporti' },
  { code: '290-02', name: 'Dogana', type: 'LIABILITY', parentCode: '290', description: 'Dogana' },
  { code: '290-03', name: 'TVSH e Importit', type: 'LIABILITY', parentCode: '290', description: 'TVSH e Importit' },
  { code: '125', name: 'Stoku', type: 'ASSET', description: 'Stoku' },
  { code: '140', name: 'Llogari te arketueshme nga klientet', type: 'ASSET', description: 'Kerkesa ndaj klienteve per shitje me kredi' },
  { code: '130', name: 'Parapagimet', type: 'ASSET', description: 'Parapagimet' },
  { code: '130-01', name: 'Parapagimet e Furnitorve', type: 'ASSET', parentCode: '130', description: 'Parapagimet e Furnitorve' },
  { code: '130-02', name: 'Parapagimet e Punetoreve', type: 'ASSET', parentCode: '130', description: 'Parapagimet e Punetoreve' },
  { code: '132', name: 'TVSH e zbritshme', type: 'ASSET', description: 'TVSH e zbritshme' },
  { code: '135', name: 'Asete tjera', type: 'ASSET', description: 'Asete tjera' },
  { code: '150', name: 'Paisje dhe orendi per zyre', type: 'ASSET', description: 'Paisje dhe orendi per zyre' },
  { code: '150-01', name: 'Kosto', type: 'ASSET', parentCode: '150', description: 'Kosto' },
  { code: '150-02', name: 'Zhvleresimi i akumuluar', type: 'ASSET', parentCode: '150', description: 'Zhvleresimi i akumuluar' },
  { code: '155', name: 'Veturat', type: 'ASSET', description: 'Veturat' },
  { code: '155-01', name: 'Kosto', type: 'ASSET', parentCode: '155', description: 'Kosto' },
  { code: '155-02', name: 'Zhvleresimi i akumuluar', type: 'ASSET', parentCode: '155', description: 'Zhvleresimi i akumuluar' },
  { code: '156', name: 'Pajisje pune', type: 'ASSET', description: 'Pajisje pune' },
  { code: '156-01', name: 'Kosto', type: 'ASSET', parentCode: '156', description: 'Kosto' },
  { code: '156-02', name: 'Zhvleresimi i akumuluar', type: 'ASSET', parentCode: '156', description: 'Zhvleresimi i akumuluar' },
  { code: '300', name: 'Hapja e gjendjes fillestare', type: 'EQUITY', description: 'Hapja e gjendjes fillestare' },
  { code: '310', name: 'Kapitali i pronarit', type: 'EQUITY', description: 'Kapitali i pronarit' },
  { code: '320', name: 'Fitimet e mbajtura', type: 'EQUITY', description: 'Fitimet e mbajtura' },
  { code: '700', name: 'Te hyrat nga shitja', type: 'REVENUE', description: 'Te hyrat operative nga shitja e mallrave dhe sherbimeve' },
  { code: '500', name: 'Kosto e mallit te shitur', type: 'EXPENSE', description: 'Kosto e mallit te shitur' },
];

export const COMPLIANCE_RULES: ComplianceRule[] = [
  { id: 'CR-001', context: 'bill',          rule: 'Every bill line must reference one of the configured Kosovo VAT categories (including 0%, 8%, 18%, import, investment and reverse-charge categories).', description: 'Bills cannot be posted unless all lines carry a recognized VAT category from compliance taxonomy.', enforcedSince: '2025-01-01' },
  { id: 'CR-002', context: 'journal_entry', rule: 'Every journal entry must satisfy: sum(debits) === sum(credits).',             description: 'Double-entry bookkeeping invariant.',                                       enforcedSince: '2025-01-01' },
  { id: 'CR-003', context: 'bill',          rule: 'Storno is only permitted on POSTED bills.',                                    description: 'Prevents double-reversal.',                                                 enforcedSince: '2025-01-01' },
  { id: 'CR-004', context: 'invoice',       rule: 'Invoice status: DRAFT → SENT → PAID, reversal only from SENT or PAID.',      description: 'Invoice lifecycle cannot skip states.',                                     enforcedSince: '2025-01-01' },
  { id: 'CR-005', context: 'bill',          rule: 'Business documents in Kosovo are recorded in EUR with valid issue/due dates and VAT categories matching domestic/import/reverse-charge context.',description: 'Currency, timeline, and VAT context consistency for Kosovo reporting.',                    enforcedSince: '2025-01-01' },
  { id: 'CR-006', context: 'invoice',       rule: 'Invoice/bill lines must have quantity > 0 and unit price >= 0.',              description: 'Prevents mathematically invalid tax base calculations.',                    enforcedSince: '2025-01-01' },
  { id: 'CR-007', context: 'gdpr',          rule: 'Free-text business fields must not include unnecessary personal data.',        description: 'Data minimization: block emails/phone/personal IDs in descriptions/notes.', enforcedSince: '2025-01-01' },
  { id: 'CR-008', context: 'gdpr',          rule: 'Personal data categories are processed only when strictly required by purpose.',description: 'Purpose limitation for operational accounting records.',                     enforcedSince: '2025-01-01' },
  { id: 'CR-009', context: 'accounting',    rule: 'Posting is allowed only on leaf (sub-category) accounts, not parent categories.', description: 'Prevents booking directly on aggregate main categories.',                 enforcedSince: '2025-01-01' },
];

const TAX_CATEGORY_EN: Record<string, { name: string; description: string }> = {
  'VAT-00-NO': { name: 'No VAT', description: 'No VAT (0%)' },
  'VAT-00-BI': { name: 'Purchases and imports without VAT', description: 'Purchases and imports without VAT (0%)' },
  'VAT-00-BII': { name: 'Investment purchases and imports without VAT', description: 'Investment purchases and imports without VAT (0%)' },
  'VAT-00-BJZ': { name: 'Purchases and imports with non-deductible VAT', description: 'Purchases and imports with non-deductible VAT (0%)' },
  'VAT-00-BIJZ': { name: 'Investment purchases and imports with non-deductible VAT', description: 'Investment purchases and imports with non-deductible VAT (0%)' },
  'VAT-IMP-18': { name: 'Imports 18%', description: 'Imports 18% (18%)' },
  'VAT-IMP-08': { name: 'Imports 8%', description: 'Imports 8% (8%)' },
  'VAT-IMPI-18': { name: 'Investment imports 18%', description: 'Investment imports 18% (18%)' },
  'VAT-IMPI-08': { name: 'Investment imports 8%', description: 'Investment imports 8% (8%)' },
  '43': { name: 'Domestic purchases 18%', description: 'Domestic purchases 18% (18%)' },
  '08': { name: 'Domestic purchases 8%', description: 'Domestic purchases 8% (8%)' },
  'VAT-BIV-18': { name: 'Domestic investment purchases 18%', description: 'Domestic investment purchases 18% (18%)' },
  'VAT-BIV-08': { name: 'Domestic investment purchases 8%', description: 'Domestic investment purchases 8% (8%)' },
  'VAT-RC-CREDIT-18': { name: 'VAT input credit related to reverse charge 18%', description: 'VAT input credit related to reverse charge 18% (18%)' },
  '28': { name: 'Purchases subject to reverse charge 18%', description: 'Purchases subject to reverse charge 18% (0%)' },
};

const ACCOUNT_EN: Record<string, { name: string; description: string }> = {
  '100': { name: 'Cash and bank', description: 'Cash in hand and bank accounts' },
  '650': { name: 'Accommodation', description: 'Accommodation expenses' },
  '655': { name: 'Trade expenses', description: 'Trade expenses' },
  '660': { name: 'Personnel expenses', description: 'Personnel expenses' },
  '660-01': { name: 'Gross salaries', description: 'Gross salaries' },
  '660-02': { name: 'Health insurance', description: 'Health insurance' },
  '660-03': { name: 'Pension contribution', description: 'Pension contribution' },
  '665': { name: 'Office expenses', description: 'Office expenses' },
  '665-01': { name: 'Rent expenses', description: 'Rent expenses' },
  '665-02': { name: 'Consumable materials', description: 'Consumable materials' },
  '665-03': { name: 'Cleaning', description: 'Cleaning' },
  '665-04': { name: 'Food and beverages', description: 'Food and beverages' },
  '665-05': { name: 'IT expenses', description: 'IT expenses' },
  '665-06': { name: 'Representation expenses', description: 'Representation expenses' },
  '665-07': { name: 'Assets under 1000 EUR', description: 'Assets under 1000 EUR' },
  '665-09': { name: 'Other', description: 'Other' },
  '667': { name: 'Professional services', description: 'Professional services' },
  '667-01': { name: 'Accounting services', description: 'Accounting services' },
  '667-02': { name: 'Legal services', description: 'Legal services' },
  '667-03': { name: 'Consulting services', description: 'Consulting services' },
  '667-04': { name: 'Audit services', description: 'Audit services' },
  '668': { name: 'Travel expenses', description: 'Travel expenses' },
  '668-01': { name: 'Accommodation', description: 'Accommodation' },
  '668-02': { name: 'Per diem', description: 'Per diem' },
  '668-03': { name: 'Transport', description: 'Transport' },
  '669': { name: 'Vehicle expenses', description: 'Vehicle expenses' },
  '669-01': { name: 'Fuel expenses', description: 'Fuel expenses' },
  '669-02': { name: 'Maintenance and repair', description: 'Maintenance and repair' },
  '675': { name: 'Communication expenses', description: 'Communication expenses' },
  '675-01': { name: 'Internet', description: 'Internet' },
  '675-02': { name: 'Mobile phone', description: 'Mobile phone' },
  '675-03': { name: 'Postal deliveries', description: 'Postal deliveries' },
  '675-04': { name: 'Fixed line phone', description: 'Fixed line phone' },
  '683': { name: 'Insurance expenses', description: 'Insurance expenses' },
  '683-01': { name: 'Vehicle insurance', description: 'Vehicle insurance' },
  '683-02': { name: 'Building insurance', description: 'Building insurance' },
  '686': { name: 'Utilities', description: 'Utilities' },
  '686-01': { name: 'Electricity', description: 'Electricity' },
  '686-02': { name: 'Water supply', description: 'Water supply' },
  '686-03': { name: 'Cleaning', description: 'Cleaning' },
  '686-04': { name: 'Heating expenses', description: 'Heating expenses' },
  '690': { name: 'Other operating expenses', description: 'Other operating expenses' },
  '690-01': { name: 'Membership expenses', description: 'Membership expenses' },
  '690-02': { name: 'Translation expenses', description: 'Translation expenses' },
  '690-03': { name: 'Bank provision', description: 'Bank provision' },
  '690-04': { name: 'Website maintenance', description: 'Website maintenance' },
  '690-05': { name: 'Municipal taxes', description: 'Municipal taxes' },
  '690-06': { name: 'Bank account maintenance', description: 'Bank account maintenance' },
  '240': { name: 'Payroll liabilities', description: 'Payroll liabilities' },
  '220': { name: 'Accounts payable to suppliers', description: 'Trade liabilities to suppliers' },
  '240-01': { name: 'Net salary', description: 'Net salary' },
  '240-02': { name: 'Pension contribution', description: 'Pension contribution' },
  '240-03': { name: 'Personal income tax', description: 'Personal income tax' },
  '240-04': { name: 'Health insurance', description: 'Health insurance' },
  '250': { name: 'VAT payable', description: 'VAT payable' },
  '256': { name: 'Reverse charge liability 18%', description: 'Reverse charge liability 18%' },
  '280': { name: 'Loans from owner', description: 'Loans from owner' },
  '290': { name: 'Import liabilities', description: 'Import liabilities' },
  '290-01': { name: 'Transport', description: 'Transport' },
  '290-02': { name: 'Customs', description: 'Customs' },
  '290-03': { name: 'Import VAT', description: 'Import VAT' },
  '125': { name: 'Inventory', description: 'Inventory' },
  '140': { name: 'Accounts receivable from customers', description: 'Customer receivables from credit sales' },
  '130': { name: 'Prepayments', description: 'Prepayments' },
  '130-01': { name: 'Supplier prepayments', description: 'Supplier prepayments' },
  '130-02': { name: 'Employee prepayments', description: 'Employee prepayments' },
  '132': { name: 'Deductible VAT', description: 'Deductible VAT' },
  '135': { name: 'Other assets', description: 'Other assets' },
  '150': { name: 'Office equipment and furniture', description: 'Office equipment and furniture' },
  '150-01': { name: 'Cost', description: 'Cost' },
  '150-02': { name: 'Accumulated depreciation', description: 'Accumulated depreciation' },
  '155': { name: 'Vehicles', description: 'Vehicles' },
  '155-01': { name: 'Cost', description: 'Cost' },
  '155-02': { name: 'Accumulated depreciation', description: 'Accumulated depreciation' },
  '156': { name: 'Work equipment', description: 'Work equipment' },
  '156-01': { name: 'Cost', description: 'Cost' },
  '156-02': { name: 'Accumulated depreciation', description: 'Accumulated depreciation' },
  '300': { name: 'Opening balance setup', description: 'Opening balance setup' },
  '310': { name: 'Owner capital', description: 'Owner capital' },
  '320': { name: 'Retained earnings', description: 'Retained earnings' },
  '700': { name: 'Sales revenue', description: 'Operating revenue from sales of goods and services' },
  '500': { name: 'Cost of goods sold', description: 'Cost of goods sold' },
};

const RULE_SQ: Record<string, { rule: string; description: string }> = {
  'CR-001': {
    rule: 'Çdo rresht i faturës duhet të referojë një nga kategoritë e konfiguruara të TVSH-së në Kosovë (duke përfshirë 0%, 8%, 18%, import, investime dhe ngarkesë të kundërt).',
    description: 'Faturat nuk mund të postohen nëse të gjithë rreshtat nuk kanë kategori të njohur TVSH-je nga taksonomia e përputhshmërisë.',
  },
  'CR-002': {
    rule: 'Çdo regjistrim kontabël duhet të plotësojë: shuma(debit) === shuma(kredit).',
    description: 'Invarianti i kontabilitetit me hyrje të dyfishtë.',
  },
  'CR-003': {
    rule: 'Storno lejohet vetëm për fatura të postuara (POSTED).',
    description: 'Parandalon kthimin e dyfishtë.',
  },
  'CR-004': {
    rule: 'Statusi i invoice: DRAFT → SENT → PAID, dhe kthimi vetëm nga SENT ose PAID.',
    description: 'Cikli i invoice nuk mund të kapërcejë gjendjet.',
  },
  'CR-005': {
    rule: 'Dokumentet e biznesit në Kosovë regjistrohen në EUR me data valide të lëshimit/skadencës dhe kategori TVSH-je që përputhen me kontekstin vendor/import/ngarkesë e kundërt.',
    description: 'Konsistencë e valutës, afateve dhe kontekstit të TVSH-së për raportimin në Kosovë.',
  },
  'CR-006': {
    rule: 'Rreshtat e invoice/faturës duhet të kenë sasi > 0 dhe çmim për njësi >= 0.',
    description: 'Parandalon llogaritje matematikisht të pavlefshme të bazës tatimore.',
  },
  'CR-007': {
    rule: 'Fushat e lira të biznesit nuk duhet të përfshijnë të dhëna personale të panevojshme.',
    description: 'Minimizimi i të dhënave: bllokon email/telefon/ID personale në përshkrime/shënime.',
  },
  'CR-008': {
    rule: 'Kategoritë e të dhënave personale përpunohen vetëm kur janë rreptësisht të nevojshme për qëllimin.',
    description: 'Kufizimi i qëllimit për regjistrat operacionalë kontabël.',
  },
  'CR-009': {
    rule: 'Postimi lejohet vetëm në llogari fundore (nën-kategori), jo në kategori prindërore.',
    description: 'Parandalon regjistrimin direkt në kategori kryesore agregate.',
  },
};

export const localizeTaxCategory = (t: TaxCategory, lang: ComplianceLang): TaxCategory => {
  if (lang !== 'en') return t;
  const tr = TAX_CATEGORY_EN[t.id];
  return tr ? { ...t, name: tr.name, description: tr.description } : t;
};

export const localizeAccount = (a: AccountCode, lang: ComplianceLang): AccountCode => {
  if (lang !== 'en') return a;
  const tr = ACCOUNT_EN[a.code];
  return tr ? { ...a, name: tr.name, description: tr.description } : a;
};

export const localizeRule = (r: ComplianceRule, lang: ComplianceLang): ComplianceRule => {
  if (lang !== 'sq') return r;
  const tr = RULE_SQ[r.id];
  return tr ? { ...r, rule: tr.rule, description: tr.description } : r;
};
