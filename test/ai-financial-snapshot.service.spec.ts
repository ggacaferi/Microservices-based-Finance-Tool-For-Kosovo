import { Test, TestingModule } from '@nestjs/testing';
import { AiFinancialSnapshotService } from '../src/application/ai/ai-financial-snapshot.service';
import { DomainEventBus } from '../src/application/events/domain-event.bus';

describe('AiFinancialSnapshotService NL and insights', () => {
  let ai: AiFinancialSnapshotService;
  let bus: DomainEventBus;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainEventBus, AiFinancialSnapshotService],
    }).compile();
    ai = module.get(AiFinancialSnapshotService);
    bus = module.get(DomainEventBus);
    await ai.onModuleInit();
  });

  it('routes natural language queries', () => {
    const q1 = ai.processNaturalLanguageQuery('How much did we spend in total?');
    expect(q1.confidence).toBeGreaterThan(0.9);

    const q2 = ai.processNaturalLanguageQuery('What is our net balance?');
    expect(q2.sources.join(',')).toContain('trial_balance');

    const q3 = ai.processNaturalLanguageQuery('Any financial issues or warnings?');
    expect(q3.answer.length).toBeGreaterThan(0);

    const q4 = ai.processNaturalLanguageQuery('Give me a status overview summary');
    expect(q4.confidence).toBeGreaterThan(0.9);

    const q5 = ai.processNaturalLanguageQuery('random unrelated text');
    expect(q5.confidence).toBeLessThan(0.9);
  });

  it('adds expense spike insight when threshold exceeded', async () => {
    for (let i = 0; i < 12; i++) {
      await bus.publish({
        type: 'journalEntryPosted',
        journalEntryId: `je-${i}`,
        reference: 'R',
        date: new Date().toISOString(),
        deltaExpenses: 1000,
      });
    }
    const snap = ai.getSnapshot();
    expect(snap.totalExpenses).toBeGreaterThan(10000);
    expect(snap.insights.some((x) => x.type === 'expense_spike')).toBe(true);
    expect(ai.getInsights(3).length).toBeLessThanOrEqual(3);
    expect(ai.getEventHistory().length).toBeGreaterThan(0);
  });
});
