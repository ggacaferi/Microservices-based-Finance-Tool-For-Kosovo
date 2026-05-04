import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { EmbeddingClient } from './embedding.client';
import { RagVectorStore } from './rag-vector-store';

interface AccountCode   { code: string; name: string; type: string; description: string; parentCode?: string }
interface ComplianceRule { id: string; context: string; rule: string; description: string }
interface TaxCategory    { id: string; name: string; rate: number; description: string; legalBasis: string }

interface ComplianceBundle {
  chartOfAccounts: AccountCode[];
  rules: ComplianceRule[];
  taxCategories: TaxCategory[];
}

/**
 * ComplianceCorpusSeeder
 *
 * Fetches the Kosovo SKA taxonomy from the Compliance Service at startup and
 * embeds each entry into the vector store as a shared (tenant_id = NULL) chunk.
 *
 * Seeding is idempotent: existing chunks are upserted by their logical key
 * (e.g. "ska_665-05") so restarting the service never duplicates the corpus.
 *
 * Three document types are indexed:
 *   ska_account     — every account code with name, type, and description
 *   compliance_rule — business rules enforced by the Compliance Service
 *   tax_category    — Kosovo VAT categories with rates and legal basis
 *
 * These become the "regulatory knowledge base" in the RAG pipeline,
 * allowing the LLM to answer questions like:
 *   "Which account should I use for IT expenses?"
 *   "What VAT rate applies to domestic purchases?"
 */
@Injectable()
export class ComplianceCorpusSeeder {
  private readonly logger       = new Logger(ComplianceCorpusSeeder.name);
  private readonly complianceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';

  constructor(
    private readonly embedder: EmbeddingClient,
    private readonly store:    RagVectorStore,
  ) {}

  async seed(): Promise<void> {
    if (!this.store.isReady) {
      this.logger.warn('ComplianceCorpusSeeder: vector store not ready — skipping corpus seed');
      return;
    }

    const bundle = await this.fetchBundle();
    if (!bundle) {
      this.logger.warn('ComplianceCorpusSeeder: compliance bundle unavailable — SKA corpus will be empty');
      return;
    }

    await this.seedAccounts(bundle.chartOfAccounts);
    await this.seedRules(bundle.rules);
    await this.seedTaxCategories(bundle.taxCategories);

    this.logger.log(
      `ComplianceCorpusSeeder: corpus ready — ` +
      `${bundle.chartOfAccounts.length} accounts, ` +
      `${bundle.rules.length} rules, ` +
      `${bundle.taxCategories.length} tax categories`,
    );
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  private async fetchBundle(): Promise<ComplianceBundle | null> {
    try {
      const res = await fetch(
        `${this.complianceUrl}/api/v1/compliance/bundle`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ComplianceBundle;
    } catch (err: any) {
      this.logger.warn(`ComplianceCorpusSeeder: could not reach compliance service — ${err.message}`);
      return null;
    }
  }

  // ── SKA Accounts ──────────────────────────────────────────────────────────

  private async seedAccounts(accounts: AccountCode[]): Promise<void> {
    const existing = await this.store.countSharedBySource('ska_account');
    if (existing >= accounts.length) {
      this.logger.log(`ComplianceCorpusSeeder: SKA accounts already seeded (${existing})`);
      return;
    }

    let seeded = 0;
    for (const acc of accounts) {
      const content = [
        `Kosovo SKA Account ${acc.code}: "${acc.name}".`,
        `Account type: ${acc.type}.`,
        acc.parentCode
          ? `This is a sub-account of ${acc.parentCode}.`
          : `This is a top-level account.`,
        acc.description ? `Purpose: ${acc.description}.` : '',
        `Post ${acc.type.toLowerCase()} transactions under SKA code ${acc.code}.`,
      ].filter(Boolean).join(' ');

      await this.upsertShared('ska_account', `ska_${acc.code}`, content, {
        code: acc.code, name: acc.name, type: acc.type, parentCode: acc.parentCode ?? null,
      });
      seeded++;
    }

    this.logger.log(`ComplianceCorpusSeeder: seeded ${seeded} SKA accounts`);
  }

  // ── Compliance Rules ──────────────────────────────────────────────────────

  private async seedRules(rules: ComplianceRule[]): Promise<void> {
    const existing = await this.store.countSharedBySource('compliance_rule');
    if (existing >= rules.length) return;

    for (const rule of rules) {
      const content =
        `Compliance rule ${rule.id} (context: ${rule.context}): ${rule.rule} ` +
        `Details: ${rule.description}`;

      await this.upsertShared('compliance_rule', `rule_${rule.id}`, content, {
        ruleId: rule.id, context: rule.context,
      });
    }
  }

  // ── Tax Categories ────────────────────────────────────────────────────────

  private async seedTaxCategories(categories: TaxCategory[]): Promise<void> {
    const existing = await this.store.countSharedBySource('tax_category');
    if (existing >= categories.length) return;

    for (const cat of categories) {
      const content =
        `Kosovo VAT category "${cat.name}" (id: ${cat.id}). ` +
        `Rate: ${(cat.rate * 100).toFixed(0)}%. ` +
        `${cat.description}. ` +
        `Legal basis: ${cat.legalBasis}.`;

      await this.upsertShared('tax_category', `tax_${cat.id}`, content, {
        categoryId: cat.id, rate: cat.rate,
      });
    }
  }

  // ── Shared helper ─────────────────────────────────────────────────────────

  private async upsertShared(
    source: string,
    key: string,
    content: string,
    extra: Record<string, any>,
  ): Promise<void> {
    try {
      const existingId = await this.store.findSharedIdByKey(source, key);
      const id         = existingId ?? uuidv4();
      const embedding  = await this.embedder.embed(content, 'RETRIEVAL_DOCUMENT');
      await this.store.upsertChunk(
        { id, tenantId: null, source, content, metadata: { key, ...extra } },
        embedding,
      );
    } catch (err: any) {
      this.logger.warn(`ComplianceCorpusSeeder: failed to embed ${source}/${key} — ${err.message}`);
    }
  }
}
