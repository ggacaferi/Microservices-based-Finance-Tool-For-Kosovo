import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Client } from 'pg';
import { AiEventOrmEntity } from './infrastructure/ai-event.orm-entity';

export interface FinancialInsight {
  id: string;
  type: 'expense_spike' | 'storno_detected' | 'trend_observation' | 'summary';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  data?: Record<string, any>;
}

/** Event shape received from Ledger Service via HTTP POST to /api/v1/ai/events */
export interface JournalEntryPostedEvent {
  type: 'journalEntryPosted';
  tenantId: string;
  journalEntryId: string;
  reference: string;
  date: string;
  deltaExpenses: number;
}

interface TenantState {
  totalExpenses: number;
  totalStornos: number;
  entryCount: number;
  lastUpdated: string;
  insightCounter: number;
  insights: FinancialInsight[];
  history: Array<{ reference: string; amount: number; date: string; isStorno: boolean }>;
}

const LEGACY_TO_SKA_ACCOUNT: Record<string, string> = {
  '1000': '100',
  '1100': '140',
  '1200': '125',
  '2000': '220',
  '4000': '700',
  '5000': '500',
  '5100': '665-09',
};

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiApiKey = process.env.GEMINI_API_KEY || '';
  private readonly geminiModel = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

  private readonly tenantStates = new Map<string, TenantState>();

  constructor(
    @Optional() @InjectRepository(AiEventOrmEntity, 'ai')
    private readonly orm?: Repository<AiEventOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'AI Service: pgvector Postgres-backed' : 'AI Service: in-memory');
  }

  async onModuleInit(): Promise<void> {
    if (!this.orm) return;
    const rows = await this.orm.find({ order: { createdAt: 'ASC' } });
    for (const row of rows) {
      const tenantId = row.tenantId || 'public';
      const state = this.stateFor(tenantId);
      const amount = Number(row.amount);
      state.totalExpenses += amount;
      state.entryCount++;
      if (row.isStorno) state.totalStornos++;
      if (row.date > state.lastUpdated) state.lastUpdated = row.date;
      state.history.push({ reference: row.reference, amount, date: row.date, isStorno: row.isStorno });
    }
    if (rows.length > 0) this.logger.log(`Rebuilt aggregates from ${rows.length} Postgres events across ${this.tenantStates.size} tenant(s)`);
  }

  /** Called by AiController when Ledger posts a journalEntryPosted event */
  ingestEvent(event: JournalEntryPostedEvent): void {
    const tenantId = event.tenantId || 'public';
    const state = this.stateFor(tenantId);
    const isStorno = event.deltaExpenses < 0;
    state.totalExpenses += event.deltaExpenses;
    state.entryCount++;
    state.lastUpdated = event.date;
    if (isStorno) state.totalStornos++;

    state.history.push({ reference: event.reference, amount: event.deltaExpenses, date: event.date, isStorno });

    if (this.orm) {
      this.orm.save({
        id: uuidv4(), tenantId, reference: event.reference, amount: event.deltaExpenses,
        date: event.date, isStorno,
        textContent: `Journal entry ${event.journalEntryId} for ${event.reference}: €${Math.abs(event.deltaExpenses).toFixed(2)} ${isStorno ? 'reversed (storno)' : 'posted'}`,
      }).catch(err => this.logger.error(`Persist failed: ${err.message}`));
    }

    if (isStorno) {
      this.addInsight(tenantId, { type: 'storno_detected', severity: 'warning', message: `Storno correction detected for ${event.reference}. Amount reversed: €${Math.abs(event.deltaExpenses).toFixed(2)}`, data: { reference: event.reference, amount: event.deltaExpenses } });
    }
    if (state.totalExpenses > 10_000) {
      this.addInsight(tenantId, { type: 'expense_spike', severity: 'critical', message: `Total expenses exceeded €10,000. Current: €${state.totalExpenses.toFixed(2)}`, data: { current: state.totalExpenses } });
    }
    if (state.entryCount > 0 && state.entryCount % 5 === 0 && state.totalStornos / state.entryCount > 0.3) {
      this.addInsight(tenantId, { type: 'trend_observation', severity: 'warning', message: `High storno rate: ${((state.totalStornos / state.entryCount) * 100).toFixed(1)}% of entries are corrections.`, data: { stornoRate: state.totalStornos / state.entryCount } });
    }
  }

  getSnapshot(tenantId: string) {
    const state = this.stateFor(tenantId);
    return { totalExpenses: state.totalExpenses, totalStornos: state.totalStornos, netExpenses: state.totalExpenses, entryCount: state.entryCount, lastUpdated: state.lastUpdated || new Date().toISOString(), insights: state.insights.slice(0, 10) };
  }

  getInsights(tenantId: string, limit = 20): FinancialInsight[] { return this.stateFor(tenantId).insights.slice(0, limit); }
  getHistory(tenantId: string)                                 { return [...this.stateFor(tenantId).history]; }

  processNaturalLanguageQuery(tenantId: string, query: string) {
    return this.answerWithGeminiAndDatabases(tenantId, query);
  }

  private addInsight(tenantId: string, partial: Omit<FinancialInsight, 'id' | 'timestamp'>): void {
    const state = this.stateFor(tenantId);
    state.insights.unshift({ id: `insight-${++state.insightCounter}`, timestamp: new Date().toISOString(), ...partial });
    if (state.insights.length > 100) state.insights.length = 100;
  }

  private async answerWithGeminiAndDatabases(tenantId: string, query: string) {
    const state = this.stateFor(tenantId);
    const inferredTargets = this.inferDatabaseTargets(query);
    const dbFindings = await Promise.all(inferredTargets.map(t => this.inspectDatabase(t, tenantId, query)));
    const successful = dbFindings.filter(f => f.ok);
    const failed = dbFindings.filter(f => !f.ok);
    const reconciliation = this.extractLedgerReconciliation(successful);

    const summary = {
      totalExpenses: typeof reconciliation?.totalAmount === 'number' ? reconciliation.totalAmount : state.totalExpenses,
      totalStornos: typeof reconciliation?.stornoCount === 'number' ? reconciliation.stornoCount : state.totalStornos,
      entryCount: typeof reconciliation?.entryCount === 'number' ? reconciliation.entryCount : state.entryCount,
      lastUpdated: state.lastUpdated,
      recentInsights: state.insights.slice(0, 5),
    };

    const fallbackSnapshot = `Tenant ${tenantId} aggregates: totalExpenses=€${Number(summary.totalExpenses).toFixed(2)}, totalStornos=${summary.totalStornos}, entryCount=${summary.entryCount}, lastUpdated=${summary.lastUpdated || 'n/a'}.`;

    if (!this.geminiApiKey) {
      return {
        query,
        answer: `AI model is not configured (missing GEMINI_API_KEY). ${fallbackSnapshot}`,
        confidence: 0.35,
        sources: [...successful.map(s => `db:${s.target.name}`), 'local_aggregate_fallback'],
        generatedAt: new Date().toISOString(),
      };
    }

    const contextBlob = JSON.stringify({
      question: query,
      tenantId,
      reconciliation,
      localSummary: summary,
      successfulDatabases: successful,
      failedDatabases: failed.map(f => ({ db: f.target.name, error: f.error })),
    });

    try {
      const answer = await this.callGemini(contextBlob);
      return {
        query,
        answer,
        confidence: successful.length > 0 ? 0.9 : 0.7,
        sources: [...successful.map(s => `db:${s.target.name}`), `model:${this.geminiModel}`],
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.warn(`Gemini call failed: ${err?.message || 'unknown error'}`);
      return {
        query,
        answer: `Could not get model response right now. ${fallbackSnapshot}`,
        confidence: 0.4,
        sources: [...successful.map(s => `db:${s.target.name}`), 'model_error_fallback'],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private inferDatabaseTargets(query: string): DbTarget[] {
    const q = query.toLowerCase();
    const all = this.getConfiguredTargets();
    const matches = new Set<string>();

    if (/(auth|user|tenant|role|permission|login|jwt)/.test(q)) matches.add('iam');
    if (/(bill|invoice|inventory|storno|operation)/.test(q)) matches.add('operations');
    if (/(ledger|journal|trial|balance|debit|credit|accounting|report|p\&l|profit|loss)/.test(q)) matches.add('ledger');
    if (/(ai|insight|analysis|anomaly|trend|snapshot)/.test(q)) matches.add('ai');

    const selected = all.filter(t => matches.has(t.name));
    if (selected.length > 0) return selected;
    return all;
  }

  private getConfiguredTargets(): DbTarget[] {
    const targets: DbTarget[] = [
      {
        name: 'iam',
        host: process.env.IAM_DB_HOST || 'iam-postgres',
        port: Number(process.env.IAM_DB_PORT || '5432'),
        user: process.env.IAM_DB_USER || 'guri_iam',
        password: process.env.IAM_DB_PASSWORD || 'localdev',
        database: process.env.IAM_DB_NAME || 'guri_iam',
      },
      {
        name: 'operations',
        host: process.env.OPS_DB_HOST || 'ops-postgres',
        port: Number(process.env.OPS_DB_PORT || '5432'),
        user: process.env.OPS_DB_USER || 'guri_ops',
        password: process.env.OPS_DB_PASSWORD || 'localdev',
        database: process.env.OPS_DB_NAME || 'guri_operations',
      },
      {
        name: 'ledger',
        host: process.env.LEDGER_DB_HOST || 'ledger-postgres',
        port: Number(process.env.LEDGER_DB_PORT || '5432'),
        user: process.env.LEDGER_DB_USER || 'guri_ledger',
        password: process.env.LEDGER_DB_PASSWORD || 'localdev',
        database: process.env.LEDGER_DB_NAME || 'guri_ledger',
      },
      {
        name: 'ai',
        host: process.env.AI_DB_HOST || 'ai-postgres',
        port: Number(process.env.AI_DB_PORT || '5432'),
        user: process.env.AI_DB_USER || 'guri_ai',
        password: process.env.AI_DB_PASSWORD || 'localdev',
        database: process.env.AI_DB_NAME || 'guri_ai',
      },
    ];

    return targets.filter(t => !!t.host && !!t.database && !!t.user);
  }

  private async inspectDatabase(target: DbTarget, tenantId: string, query: string): Promise<DbInspectionResult> {
    const client = new Client({
      host: target.host,
      port: target.port,
      user: target.user,
      password: target.password,
      database: target.database,
      connectionTimeoutMillis: 3000,
      query_timeout: 4000,
    });

    try {
      await client.connect();
      const tablesRes = await client.query<{ table_schema: string; table_name: string }>(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE' AND table_schema = 'public'
         ORDER BY table_name`,
      );

      const tableNames = tablesRes.rows.map((r: { table_schema: string; table_name: string }) => r.table_name);
      const tokens = (query.toLowerCase().match(/[a-z0-9_\-]+/g) || []).filter(t => t.length >= 3);
      const relevant = tableNames
        .filter((t: string) => tokens.some(tok => t.includes(tok) || tok.includes(t)))
        .slice(0, 5);
      const selectedTables = (relevant.length > 0 ? relevant : tableNames.slice(0, 3)).slice(0, 5);

      const tableSamples: Array<{ table: string; approxRows: number; sample: any[] }> = [];
      const tableSummaries: Array<{ table: string; metrics: Record<string, any> }> = [];
      const skippedTables: Array<{ table: string; reason: string }> = [];
      for (const table of selectedTables) {
        const safe = this.quoteIdent(table);
        const colsRes = await client.query<{ column_name: string }>(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1`,
          [table],
        );
        const tenantColumn = this.pickTenantColumn(colsRes.rows.map((c: { column_name: string }) => c.column_name));
        if (!tenantColumn) {
          skippedTables.push({ table, reason: 'no tenant column' });
          continue;
        }

        const tenantSafe = this.quoteIdent(tenantColumn);
        const columns = colsRes.rows.map((c: { column_name: string }) => c.column_name);
        const orderByColumn = columns.includes('createdAt') ? 'createdAt' : (columns.includes('date') ? 'date' : null);
        const approxRes = await client.query<{ estimate: number }>(
          `SELECT COALESCE((
              SELECT reltuples::bigint
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = $1
            ), 0) AS estimate`,
          [table],
        );

        const orderSql = orderByColumn ? ` ORDER BY ${this.quoteIdent(orderByColumn)} DESC` : '';
        const sampleRes = await client.query<{ row: any }>(
          `SELECT row_to_json(t) AS row
             FROM (
               SELECT *
                 FROM public.${safe}
                WHERE ${tenantSafe} = $1
                ${orderSql}
                LIMIT 3
             ) t`,
          [tenantId],
        );

        const normalizedSample = sampleRes.rows.map((r: { row: any }) => this.normalizeSampleRow(table, r.row));
        tableSamples.push({
          table,
          approxRows: Number(approxRes.rows[0]?.estimate || 0),
          sample: normalizedSample,
        });

        if (table === 'ledger_journal_entries') {
          const totals = await client.query<{ entry_count: string; total_amount: string; storno_count: string }>(
            `SELECT COUNT(*)::text AS entry_count,
                    COALESCE(SUM(amount), 0)::text AS total_amount,
                    COUNT(*) FILTER (WHERE kind = 'STORNO')::text AS storno_count
               FROM public.${safe}
              WHERE ${tenantSafe} = $1`,
            [tenantId],
          );

          const debitCredit = await client.query<{ total_debits: string; total_credits: string }>(
            `SELECT COALESCE(SUM((line->>'debit')::numeric), 0)::text AS total_debits,
                    COALESCE(SUM((line->>'credit')::numeric), 0)::text AS total_credits
               FROM public.${safe} t
               CROSS JOIN LATERAL jsonb_array_elements(t.lines) AS line
              WHERE ${tenantSafe} = $1`,
            [tenantId],
          );

          tableSummaries.push({
            table,
            metrics: {
              entryCount: Number(totals.rows[0]?.entry_count || 0),
              totalAmount: Number(totals.rows[0]?.total_amount || 0),
              stornoCount: Number(totals.rows[0]?.storno_count || 0),
              totalDebits: Number(debitCredit.rows[0]?.total_debits || 0),
              totalCredits: Number(debitCredit.rows[0]?.total_credits || 0),
              netBalance: Number(debitCredit.rows[0]?.total_debits || 0) - Number(debitCredit.rows[0]?.total_credits || 0),
            },
          });
        }
      }

      return {
        ok: true,
        target,
        tableCount: tableNames.length,
        selectedTables,
        tableSamples,
        tableSummaries,
        skippedTables,
      };
    } catch (err: any) {
      return {
        ok: false,
        target,
        error: err?.message || 'database inspection failed',
      };
    } finally {
      await client.end().catch(() => {});
    }
  }

  private quoteIdent(input: string): string {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) throw new Error(`Unsafe identifier: ${input}`);
    return `"${input}"`;
  }

  private pickTenantColumn(columns: string[]): string | null {
    if (columns.includes('tenantId')) return 'tenantId';
    if (columns.includes('tenant_id')) return 'tenant_id';
    return null;
  }

  private normalizeSampleRow(table: string, row: any): any {
    if (table !== 'ledger_journal_entries' || !row || !Array.isArray(row.lines)) return row;
    return {
      ...row,
      lines: row.lines.map((l: any) => ({
        ...l,
        account: LEGACY_TO_SKA_ACCOUNT[String(l?.account || '')] || l?.account,
      })),
    };
  }

  private extractLedgerReconciliation(results: DbInspectionResult[]): Record<string, any> | null {
    const ledger = results.find(r => r.target.name === 'ledger');
    if (!ledger?.tableSummaries?.length) return null;
    const summary = ledger.tableSummaries.find(s => s.table === 'ledger_journal_entries');
    return summary ? summary.metrics : null;
  }

  private async callGemini(contextBlob: string): Promise<string> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;
    const prompt = [
      'You are a finance AI analyst for a Kosovo ERP system.',
      'Use only the provided database context and local aggregates.',
      'Never infer or mix data across tenants. Tenant isolation is strict.',
      'If reconciliation metrics from ledger are present, treat them as the source of truth over stale local aggregates.',
      'Use Kosovo-normalized SKA account codes when referring to accounts.',
      'Be precise, mention assumptions and data gaps, and provide concise practical next steps.',
      '',
      contextBlob,
    ].join('\n');

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini HTTP ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('\n').trim() : '';
    if (!text) throw new Error('Gemini returned empty response');
    return text;
  }

  private stateFor(tenantId: string): TenantState {
    const key = tenantId || 'public';
    const existing = this.tenantStates.get(key);
    if (existing) return existing;
    const created: TenantState = {
      totalExpenses: 0,
      totalStornos: 0,
      entryCount: 0,
      lastUpdated: '',
      insightCounter: 0,
      insights: [],
      history: [],
    };
    this.tenantStates.set(key, created);
    return created;
  }
}

interface DbTarget {
  name: 'iam' | 'operations' | 'ledger' | 'ai';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface DbInspectionResult {
  ok: boolean;
  target: DbTarget;
  tableCount?: number;
  selectedTables?: string[];
  tableSamples?: Array<{ table: string; approxRows: number; sample: any[] }>;
  tableSummaries?: Array<{ table: string; metrics: Record<string, any> }>;
  skippedTables?: Array<{ table: string; reason: string }>;
  error?: string;
}
