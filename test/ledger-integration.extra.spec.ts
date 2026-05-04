import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventBus } from '../src/application/events/domain-event.bus';
import { LedgerIntegrationService } from '../src/application/ledger/ledger-integration.service';
import { ActivityLogService } from '../src/application/operations/activity-log.service';

describe('LedgerIntegrationService extra paths', () => {
  let ledger: LedgerIntegrationService;
  let bus: DomainEventBus;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainEventBus, LedgerIntegrationService, ActivityLogService],
    }).compile();
    ledger = module.get(LedgerIntegrationService);
    bus = module.get(DomainEventBus);
    await bus.onModuleInit();
    ledger.onModuleInit();
  });

  it('records skip when storno has no original', () => {
    bus.publish({
      type: 'billRevertRequested',
      billId: 'ghost',
      originalReference: 'Bill-ghost',
      date: new Date().toISOString(),
      reason: 'none',
    });
    const wf = ledger.explainBillWorkflow('ghost');
    expect(wf.journalEntries).toHaveLength(0);
  });

  it('getAllEntries, getEntryById, getTrialBalance, getSummary', () => {
    bus.publish({
      type: 'billPosted',
      billId: 'b1',
      supplierId: 'S',
      totalNetAmount: 40,
      originalReference: 'Bill-b1',
      date: new Date().toISOString(),
    });
    const all = ledger.getAllEntries();
    expect(all.length).toBeGreaterThan(0);
    const one = ledger.getEntryById(all[0].id);
    expect(one).toBeDefined();

    const tb = ledger.getTrialBalance();
    expect(tb.length).toBeGreaterThan(0);

    const summary = ledger.getSummary();
    expect(summary.totalEntries).toBeGreaterThan(0);
    expect(summary.balanced).toBe(true);
  });
});
