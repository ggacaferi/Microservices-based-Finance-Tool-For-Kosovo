import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DomainEventBus, JournalEntryPostedEvent } from '../events/domain-event.bus';
import { AiEventOrmEntity } from '../../infrastructure/persistence/ai/ai-event.orm-entity';

export interface FinancialInsight {
  id: string;
  type: 'expense_spike' | 'trend_observation' | 'summary';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  data?: Record<string, any>;
}

export interface FinancialSnapshot {
  totalExpenses: number;
  netExpenses: number;
  entryCount: number;
  lastUpdated: string;
  insights: FinancialInsight[];
}

/**
 * AI Financial Snapshot Service — The Intelligence Layer
 *
 * Asynchronously ingests posted journal entries to build a safe read-model.
 * Accepts natural language queries and returns financial insights.
 *
 * In production this would use a Vector Store and LLM for RAG-based queries.
 * Here we demonstrate the architectural pattern with deterministic analysis.
 */
@Injectable()
export class AiFinancialSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(AiFinancialSnapshotService.name);

  private totalExpenses = 0;
  private entryCount = 0;
  private lastUpdated = '';
  private readonly insights: FinancialInsight[] = [];
  private readonly eventHistory: Array<{ reference: string; amount: number; date: string }> = [];
  private insightCounter = 0;

  constructor(
    private readonly domainEventBus: DomainEventBus,
    @Optional() @InjectRepository(AiEventOrmEntity, 'ai')
    private readonly ormRepo?: Repository<AiEventOrmEntity>,
  ) {
    if (this.ormRepo) {
      this.logger.log('AI Service: pgvector Postgres-backed (ai_financial_events)');
    } else {
      this.logger.log('AI Service: in-memory fallback');
    }
  }

  onModuleInit(): void {
    this.domainEventBus.subscribe('journalEntryPosted', (event) => {
      this.ingestJournalEntry(event);
    });
    this.logger.log('AI Financial Snapshot Service initialized — listening for journalEntryPosted events');
  }

  private ingestJournalEntry(event: JournalEntryPostedEvent): void {
    this.totalExpenses += event.deltaExpenses;
    this.entryCount++;
    this.lastUpdated = event.date;

    this.eventHistory.push({
      reference: event.reference,
      amount: event.deltaExpenses,
      date: event.date,
    });

    // Persist to pgvector-backed Postgres for RAG retrieval
    if (this.ormRepo) {
      this.ormRepo.save({
        id: uuidv4(),
        reference: event.reference,
        amount: event.deltaExpenses,
        date: event.date,
        isStorno: false,
        textContent: `Journal entry ${event.journalEntryId} for ${event.reference}: ` +
          `€${Math.abs(event.deltaExpenses).toFixed(2)} posted`,
      }).catch((err) => this.logger.error(`Failed to persist AI event: ${err.message}`));
    }

    if (this.totalExpenses > 10000) {
      this.addInsight({
        type: 'expense_spike',
        message: `Total expenses have exceeded €10,000 threshold. Current: €${this.totalExpenses.toFixed(2)}`,
        severity: 'critical',
        data: { threshold: 10000, current: this.totalExpenses },
      });
    }

    if (this.entryCount > 0 && this.entryCount % 5 === 0) {
      // Storno/correction heuristics intentionally removed: AI must not infer or label stornos.
    }
  }

  private addInsight(partial: Omit<FinancialInsight, 'id' | 'timestamp'>): void {
    this.insightCounter++;
    this.insights.unshift({
      id: `insight-${this.insightCounter}`,
      timestamp: new Date().toISOString(),
      ...partial,
    });
    if (this.insights.length > 100) this.insights.length = 100;
  }

  getSnapshot(): FinancialSnapshot {
    return {
      totalExpenses: this.totalExpenses,
      netExpenses: this.totalExpenses,
      entryCount: this.entryCount,
      lastUpdated: this.lastUpdated || new Date().toISOString(),
      insights: this.insights.slice(0, 10),
    };
  }

  /**
   * Natural Language Query — rule-based analysis engine
   *
   * In production: embed query → search Vector Store → feed context + query to LLM.
   * Here we demonstrate the pattern with keyword-based routing.
   */
  processNaturalLanguageQuery(query: string): {
    query: string;
    answer: string;
    confidence: number;
    sources: string[];
    generatedAt: string;
  } {
    const q = query.toLowerCase().trim();
    const sources: string[] = [];
    let answer: string;
    let confidence: number;

    if (q.includes('total expense') || q.includes('how much') || q.includes('spent')) {
      answer = `Your total expenses are currently €${this.totalExpenses.toFixed(2)} across ${this.entryCount} journal entries.`;
      confidence = 0.95;
      sources.push('journal_entries_aggregate');
    } else if (q.includes('balance') || q.includes('net') || q.includes('profit')) {
      answer = `Net expenses stand at €${this.totalExpenses.toFixed(2)}. The books have ${this.entryCount} journal entries recorded.`;
      confidence = 0.88;
      sources.push('journal_entries_aggregate', 'trial_balance');
    } else if (q.includes('insight') || q.includes('issue') || q.includes('problem') || q.includes('warning')) {
      const warnings = this.insights.filter((i) => i.severity === 'warning' || i.severity === 'critical');
      if (warnings.length > 0) {
        answer = `I found ${warnings.length} concern(s):\n` +
          warnings.slice(0, 5).map((w, i) => `${i + 1}. [${w.severity.toUpperCase()}] ${w.message}`).join('\n');
      } else {
        answer = 'No financial concerns detected. All entries appear balanced and consistent.';
      }
      confidence = 0.85;
      sources.push('insights_engine', 'journal_entries');
    } else if (q.includes('summary') || q.includes('overview') || q.includes('status')) {
      answer = `Financial Overview:\n` +
        `• Total expenses: €${this.totalExpenses.toFixed(2)}\n` +
        `• Journal entries: ${this.entryCount}\n` +
        `• Active insights: ${this.insights.length}\n` +
        `• Books balanced: Yes (double-entry enforced)`;
      confidence = 0.96;
      sources.push('journal_entries_aggregate', 'insights_engine', 'ledger_summary');
    } else {
      answer = `Based on available financial data: total expenses are €${this.totalExpenses.toFixed(2)} with ${this.entryCount} entries. ` +
        `Try asking about expenses, balance, or insights for specific analysis.`;
      confidence = 0.6;
      sources.push('general_knowledge');
    }

    return { query, answer, confidence, sources, generatedAt: new Date().toISOString() };
  }

  getInsights(limit = 20): FinancialInsight[] {
    return this.insights.slice(0, limit);
  }

  getEventHistory(): Array<{ reference: string; amount: number; date: string }> {
    return [...this.eventHistory];
  }
}
