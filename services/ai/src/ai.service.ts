import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
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
  journalEntryId: string;
  reference: string;
  date: string;
  deltaExpenses: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  private totalExpenses = 0;
  private totalStornos  = 0;
  private entryCount    = 0;
  private lastUpdated   = '';
  private insightCounter = 0;
  private readonly insights: FinancialInsight[] = [];
  private readonly history: { reference: string; amount: number; date: string; isStorno: boolean }[] = [];

  constructor(
    @Optional() @InjectRepository(AiEventOrmEntity, 'ai')
    private readonly orm?: Repository<AiEventOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'AI Service: pgvector Postgres-backed' : 'AI Service: in-memory');
  }

  /** Called by AiController when Ledger posts a journalEntryPosted event */
  ingestEvent(event: JournalEntryPostedEvent): void {
    const isStorno = event.deltaExpenses < 0;
    this.totalExpenses += event.deltaExpenses;
    this.entryCount++;
    this.lastUpdated = event.date;
    if (isStorno) this.totalStornos++;

    this.history.push({ reference: event.reference, amount: event.deltaExpenses, date: event.date, isStorno });

    if (this.orm) {
      this.orm.save({
        id: uuidv4(), reference: event.reference, amount: event.deltaExpenses,
        date: event.date, isStorno,
        textContent: `Journal entry ${event.journalEntryId} for ${event.reference}: €${Math.abs(event.deltaExpenses).toFixed(2)} ${isStorno ? 'reversed (storno)' : 'posted'}`,
      }).catch(err => this.logger.error(`Persist failed: ${err.message}`));
    }

    if (isStorno) {
      this.addInsight({ type: 'storno_detected', severity: 'warning', message: `Storno correction detected for ${event.reference}. Amount reversed: €${Math.abs(event.deltaExpenses).toFixed(2)}`, data: { reference: event.reference, amount: event.deltaExpenses } });
    }
    if (this.totalExpenses > 10_000) {
      this.addInsight({ type: 'expense_spike', severity: 'critical', message: `Total expenses exceeded €10,000. Current: €${this.totalExpenses.toFixed(2)}`, data: { current: this.totalExpenses } });
    }
    if (this.entryCount > 0 && this.entryCount % 5 === 0 && this.totalStornos / this.entryCount > 0.3) {
      this.addInsight({ type: 'trend_observation', severity: 'warning', message: `High storno rate: ${((this.totalStornos / this.entryCount) * 100).toFixed(1)}% of entries are corrections.`, data: { stornoRate: this.totalStornos / this.entryCount } });
    }
  }

  getSnapshot() {
    return { totalExpenses: this.totalExpenses, totalStornos: this.totalStornos, netExpenses: this.totalExpenses, entryCount: this.entryCount, lastUpdated: this.lastUpdated || new Date().toISOString(), insights: this.insights.slice(0, 10) };
  }

  getInsights(limit = 20): FinancialInsight[] { return this.insights.slice(0, limit); }
  getHistory()                                 { return [...this.history]; }

  processNaturalLanguageQuery(query: string) {
    const q = query.toLowerCase().trim();
    let answer: string; let confidence: number; const sources: string[] = [];

    if (q.includes('total expense') || q.includes('how much') || q.includes('spent')) {
      answer = `Total expenses: €${this.totalExpenses.toFixed(2)} across ${this.entryCount} journal entries.${this.totalStornos > 0 ? ` Includes ${this.totalStornos} storno correction(s).` : ''}`;
      confidence = 0.95; sources.push('journal_entries_aggregate');
    } else if (q.includes('storno') || q.includes('reversal')) {
      const stornoEvents = this.history.filter(e => e.isStorno);
      answer = `${this.totalStornos} storno correction(s) recorded.${stornoEvents.length > 0 ? ` Total reversed: €${stornoEvents.reduce((s, e) => s + Math.abs(e.amount), 0).toFixed(2)}.` : ''}`;
      confidence = 0.92; sources.push('storno_history');
    } else if (q.includes('balance') || q.includes('net')) {
      answer = `Net expenses: €${this.totalExpenses.toFixed(2)}. ${this.entryCount} journal entries, ${this.totalStornos} storno corrections.`;
      confidence = 0.88; sources.push('journal_entries_aggregate');
    } else if (q.includes('insight') || q.includes('warning') || q.includes('issue')) {
      const warnings = this.insights.filter(i => i.severity === 'warning' || i.severity === 'critical');
      answer = warnings.length > 0 ? `${warnings.length} concern(s):\n${warnings.slice(0, 5).map((w, i) => `${i + 1}. [${w.severity.toUpperCase()}] ${w.message}`).join('\n')}` : 'No financial concerns detected.';
      confidence = 0.85; sources.push('insights_engine');
    } else {
      answer = `Total expenses: €${this.totalExpenses.toFixed(2)}, ${this.entryCount} entries. Try asking about expenses, stornos, balance, or insights.`;
      confidence = 0.6; sources.push('general_knowledge');
    }

    return { query, answer, confidence, sources, generatedAt: new Date().toISOString() };
  }

  private addInsight(partial: Omit<FinancialInsight, 'id' | 'timestamp'>): void {
    this.insights.unshift({ id: `insight-${++this.insightCounter}`, timestamp: new Date().toISOString(), ...partial });
    if (this.insights.length > 100) this.insights.length = 100;
  }
}
