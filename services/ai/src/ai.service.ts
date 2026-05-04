import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AiEventOrmEntity } from './infrastructure/ai-event.orm-entity';
import { EmbeddingClient } from './rag/embedding.client';
import { RagVectorStore, RagChunk } from './rag/rag-vector-store';
import { ComplianceCorpusSeeder } from './rag/compliance-corpus.seeder';

// ── Public types (controller depends on these) ────────────────────────────

export interface FinancialInsight {
  id:        string;
  type:      'expense_spike' | 'trend_observation' | 'summary';
  message:   string;
  severity:  'info' | 'warning' | 'critical';
  timestamp: string;
  data?:     Record<string, any>;
}

/** Event shape received from Ledger Service */
export interface JournalEntryPostedEvent {
  type:           'journalEntryPosted';
  tenantId:       string;
  journalEntryId: string;
  reference:      string;
  date:           string;
  deltaExpenses:  number;
}

// ── Internal state ────────────────────────────────────────────────────────

interface TenantState {
  totalExpenses:  number;
  entryCount:     number;
  lastUpdated:    string;
  insightCounter: number;
  insights:       FinancialInsight[];
  history:        Array<{ reference: string; amount: number; date: string }>;
}

/**
 * AiService — Retrieval-Augmented Generation pipeline
 *
 * Ingest path:
 *   Ledger fires journalEntryPosted → ingestEvent() updates the in-memory
 *   aggregate, persists to Postgres, and indexes an embedding in the
 *   ai_rag_chunks table so it becomes retrievable.
 *
 * Query path (POST /ai/query):
 *   1. Embed the user's question with Gemini text-embedding-004 (RETRIEVAL_QUERY)
 *   2. Cosine-similarity search over ai_rag_chunks:
 *      — shared corpus: SKA accounts, compliance rules, VAT categories
 *      — tenant corpus: journal entry chunks for this tenant
 *   3. Augment: inject retrieved chunks + in-memory financial summary into prompt
 *   4. Generate: call Gemini generateContent with the augmented prompt
 *   5. Return answer, sources, confidence — same response shape as before
 *
 * Fallback: when no Gemini API key is set or the vector store is unavailable
 * the service returns the plain aggregate snapshot so the API never errors.
 *
 * Public API surface is unchanged — AiController needs no modifications.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);

  private readonly geminiApiKey = process.env.GEMINI_API_KEY || '';
  private readonly geminiModel  = process.env.GEMINI_MODEL   || 'gemini-2.0-flash';

  private readonly tenantStates = new Map<string, TenantState>();

  constructor(
    @Optional() @InjectRepository(AiEventOrmEntity, 'ai')
    private readonly orm?: Repository<AiEventOrmEntity>,

    @Optional() private readonly embedder?: EmbeddingClient,
    @Optional() private readonly vectorStore?: RagVectorStore,
    @Optional() private readonly corpusSeeder?: ComplianceCorpusSeeder,
  ) {
    this.logger.log(this.orm ? 'AiService: pgvector Postgres-backed' : 'AiService: in-memory');
  }

  async onModuleInit(): Promise<void> {
    // Rehydrate in-memory aggregate from persisted events
    if (this.orm) {
      const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
      for (const row of rows) {
        const tenantId = row.tenantId || 'public';
        const state    = this.stateFor(tenantId);
        const amount   = Number(row.amount);
        state.totalExpenses += amount;
        state.entryCount++;
        if (row.date > state.lastUpdated) state.lastUpdated = row.date;
        state.history.push({ reference: row.reference, amount, date: row.date });
      }
      if (rows.length > 0)
        this.logger.log(`Rehydrated ${rows.length} events across ${this.tenantStates.size} tenant(s)`);
    }

    // Seed shared compliance corpus (SKA accounts, rules, VAT categories)
    // Runs after RagVectorStore.onModuleInit() because NestJS resolves providers
    // in dependency order (VectorStore → Seeder → AiService).
    if (this.corpusSeeder) {
      await this.corpusSeeder.seed().catch(err =>
        this.logger.warn(`Corpus seed failed (non-fatal): ${err?.message}`),
      );
    }
  }

  // ── Ingest (called by controller and Kafka consumer) ─────────────────────

  ingestEvent(event: JournalEntryPostedEvent): void {
    const tenantId = event.tenantId || 'public';
    const state    = this.stateFor(tenantId);

    state.totalExpenses += event.deltaExpenses;
    state.entryCount++;
    state.lastUpdated = event.date;
    state.history.push({ reference: event.reference, amount: event.deltaExpenses, date: event.date });

    const text = this.buildJournalChunkText(event);

    if (this.orm) {
      this.orm.save({
        id:          uuidv4(),
        tenantId,
        reference:   event.reference,
        amount:      event.deltaExpenses,
        date:        event.date,
        isStorno:    false,
        textContent: text,
      }).catch(err => this.logger.error(`Persist failed: ${err.message}`));
    }

    // Fire-and-forget embedding — does not block the HTTP response to Ledger
    if (this.embedder && this.vectorStore?.isReady) {
      this.indexJournalChunk(event, text).catch(err =>
        this.logger.warn(`Journal embedding failed (non-fatal): ${err?.message}`),
      );
    }

    if (state.totalExpenses > 10_000) {
      this.addInsight(tenantId, {
        type:    'expense_spike',
        severity:'critical',
        message: `Total expenses exceeded €10,000. Current: €${state.totalExpenses.toFixed(2)}`,
        data:    { current: state.totalExpenses },
      });
    }
  }

  // ── Public query API ─────────────────────────────────────────────────────

  processNaturalLanguageQuery(tenantId: string, query: string) {
    return this.answerWithRag(tenantId, query);
  }

  getSnapshot(tenantId: string) {
    const state = this.stateFor(tenantId);
    return {
      totalExpenses: state.totalExpenses,
      netExpenses:   state.totalExpenses,
      entryCount:    state.entryCount,
      lastUpdated:   state.lastUpdated || new Date().toISOString(),
      insights:      state.insights.slice(0, 10),
    };
  }

  getInsights(tenantId: string, limit = 20): FinancialInsight[] {
    return this.stateFor(tenantId).insights.slice(0, limit);
  }

  getHistory(tenantId: string) {
    return [...this.stateFor(tenantId).history];
  }

  // ── RAG pipeline ──────────────────────────────────────────────────────────

  private async answerWithRag(tenantId: string, query: string) {
    const state   = this.stateFor(tenantId);
    const summary = {
      totalExpenses: state.totalExpenses,
      entryCount:    state.entryCount,
      lastUpdated:   state.lastUpdated,
      recentInsights: state.insights.slice(0, 5),
    };
    const fallbackSnapshot =
      `Tenant ${tenantId}: total tracked expenses €${state.totalExpenses.toFixed(2)}, ` +
      `${state.entryCount} journal entries, last updated ${state.lastUpdated || 'n/a'}.`;

    // ── Step 1: Embed the query ─────────────────────────────────────────────
    let chunks: RagChunk[] = [];
    if (this.embedder && this.vectorStore?.isReady) {
      try {
        const queryEmbedding = await this.embedder.embed(query, 'RETRIEVAL_QUERY');
        chunks = await this.vectorStore.similaritySearch(queryEmbedding, tenantId, 8);
      } catch (err: any) {
        this.logger.warn(`RAG retrieval failed (non-fatal): ${err.message}`);
      }
    }

    // ── Step 2: Augment ────────────────────────────────────────────────────
    const retrievedContext = chunks.length > 0
      ? chunks
          .map((c, i) =>
            `[${i + 1}] source:${c.source} relevance:${(c.score ?? 0).toFixed(3)}\n${c.content}`,
          )
          .join('\n\n')
      : '(No vector context retrieved — answer from financial summary only.)';

    const prompt = [
      'You are a financial AI analyst for Guri Finance, a Kosovo ERP system.',
      'Answer ONLY from the provided retrieved context and financial summary below.',
      'Never fabricate account codes, amounts, legal references, or transaction details.',
      'Tenant isolation is strict — data in this context belongs exclusively to this tenant.',
      'Reference specific SKA account codes (e.g. 665-05, 700, 220) when relevant.',
      'If the retrieved context is insufficient to answer, say so explicitly.',
      '',
      `=== FINANCIAL SUMMARY (tenant: ${tenantId}) ===`,
      `Total expenses tracked : €${summary.totalExpenses.toFixed(2)}`,
      `Journal entry count    : ${summary.entryCount}`,
      `Last updated           : ${summary.lastUpdated || 'no data yet'}`,
      '',
      `=== RETRIEVED CONTEXT (${chunks.length} chunk${chunks.length !== 1 ? 's' : ''} via RAG) ===`,
      retrievedContext,
      '',
      '=== USER QUESTION ===',
      query,
    ].join('\n');

    // ── Step 3: Fallback without API key ────────────────────────────────────
    if (!this.geminiApiKey) {
      return {
        query,
        answer:      `GEMINI_API_KEY not configured. ${fallbackSnapshot}`,
        confidence:  0.35,
        sources:     chunks.map(c => `${c.source}:${c.metadata?.key ?? c.id}`),
        ragChunks:   chunks.length,
        generatedAt: new Date().toISOString(),
      };
    }

    // ── Step 4: Generate ────────────────────────────────────────────────────
    try {
      const answer = await this.callGemini(prompt);
      return {
        query,
        answer,
        confidence:  chunks.length > 0 ? 0.9 : 0.6,
        sources:     [
          ...chunks.map(c => `${c.source}:${c.metadata?.key ?? c.id}`),
          `model:${this.geminiModel}`,
        ],
        ragChunks:   chunks.length,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.warn(`Gemini generation failed: ${err.message}`);
      return {
        query,
        answer:      `Model unavailable. ${fallbackSnapshot}`,
        confidence:  0.4,
        sources:     chunks.map(c => `${c.source}:${c.metadata?.key ?? c.id}`),
        ragChunks:   chunks.length,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // ── Indexing helpers ──────────────────────────────────────────────────────

  /**
   * Build a human-readable text representation of a journal event.
   * This is the text that gets embedded and stored in the vector store.
   * Rich descriptions improve retrieval quality significantly.
   */
  private buildJournalChunkText(event: JournalEntryPostedEvent): string {
    const absAmount  = Math.abs(event.deltaExpenses);
    const isStorno   = event.deltaExpenses < 0;
    const entryKind  = isStorno ? 'Storno (reversal) journal entry' : 'Journal entry';
    return [
      `${entryKind} posted for reference ${event.reference} on ${event.date}.`,
      `Amount: €${absAmount.toFixed(2)}.`,
      isStorno
        ? `This is a compensating storno entry that reverses a previously posted transaction.`
        : `This records a new financial transaction.`,
      `Tenant: ${event.tenantId}.`,
      `Journal entry ID: ${event.journalEntryId}.`,
    ].join(' ');
  }

  /** Embed and store a journal entry chunk in the vector store. */
  private async indexJournalChunk(
    event: JournalEntryPostedEvent,
    text: string,
  ): Promise<void> {
    if (!this.embedder || !this.vectorStore?.isReady) return;
    const embedding = await this.embedder.embed(text, 'RETRIEVAL_DOCUMENT');
    await this.vectorStore.upsertChunk(
      {
        id:       event.journalEntryId,        // stable — same entry won't be re-indexed
        tenantId: event.tenantId || 'public',
        source:   'journal_entry',
        content:  text,
        metadata: {
          reference: event.reference,
          date:      event.date,
          amount:    event.deltaExpenses,
        },
      },
      embedding,
    );
  }

  // ── Gemini generate ───────────────────────────────────────────────────────

  private async callGemini(prompt: string): Promise<string> {
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:    0.2,
          topP:           0.9,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    const parts      = json?.candidates?.[0]?.content?.parts;
    const text       = Array.isArray(parts)
      ? parts.map((p: any) => p?.text ?? '').join('\n').trim()
      : '';
    if (!text) throw new Error('Gemini returned empty response');
    return text;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private addInsight(tenantId: string, partial: Omit<FinancialInsight, 'id' | 'timestamp'>): void {
    const state = this.stateFor(tenantId);
    state.insights.unshift({
      id:        `insight-${++state.insightCounter}`,
      timestamp: new Date().toISOString(),
      ...partial,
    });
    if (state.insights.length > 100) state.insights.length = 100;
  }

  private stateFor(tenantId: string): TenantState {
    const key      = tenantId || 'public';
    const existing = this.tenantStates.get(key);
    if (existing) return existing;
    const created: TenantState = {
      totalExpenses: 0, entryCount: 0, lastUpdated: '',
      insightCounter: 0, insights: [], history: [],
    };
    this.tenantStates.set(key, created);
    return created;
  }
}
