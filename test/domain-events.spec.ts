import { Test, TestingModule } from '@nestjs/testing';
import { DomainEventBus } from '../src/application/events/domain-event.bus';
import { LedgerIntegrationService } from '../src/application/ledger/ledger-integration.service';
import { AiFinancialSnapshotService } from '../src/application/ai/ai-financial-snapshot.service';
import { ActivityLogService } from '../src/application/operations/activity-log.service';

describe('Domain Event System', () => {
  let eventBus: DomainEventBus;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainEventBus],
    }).compile();

    eventBus = module.get<DomainEventBus>(DomainEventBus);
  });

  it('should be defined', () => {
    expect(eventBus).toBeDefined();
  });

  it('should subscribe and publish events', () => {
    const events: any[] = [];
    
    eventBus.subscribe('billPosted', (event) => {
      events.push(event);
    });

    eventBus.publish({
      type: 'billPosted',
      billId: 'test-123',
      supplierId: 'SUP-1',
      totalNetAmount: 100,
      originalReference: 'Bill-test-123',
      date: new Date().toISOString()
    });

    expect(events).toHaveLength(1);
    expect(events[0].billId).toBe('test-123');
    expect(events[0].totalNetAmount).toBe(100);
  });

  it('should support multiple subscribers for same event', () => {
    const handler1Calls: any[] = [];
    const handler2Calls: any[] = [];

    eventBus.subscribe('billRevertRequested', (event) => {
      handler1Calls.push(event);
    });

    eventBus.subscribe('billRevertRequested', (event) => {
      handler2Calls.push(event);
    });

    eventBus.publish({
      type: 'billRevertRequested',
      billId: 'test-456',
      originalReference: 'Bill-test-456',
      date: new Date().toISOString(),
      reason: 'Test'
    });

    expect(handler1Calls).toHaveLength(1);
    expect(handler2Calls).toHaveLength(1);
    expect(handler1Calls[0].billId).toBe('test-456');
    expect(handler2Calls[0].billId).toBe('test-456');
  });

  it('should only trigger subscribed event types', () => {
    const billPostedCalls: any[] = [];
    const billRevertedCalls: any[] = [];

    eventBus.subscribe('billPosted', (event) => {
      billPostedCalls.push(event);
    });

    eventBus.subscribe('billRevertRequested', (event) => {
      billRevertedCalls.push(event);
    });

    eventBus.publish({
      type: 'billPosted',
      billId: 'test-1',
      supplierId: 'SUP-1',
      totalNetAmount: 50,
      originalReference: 'Bill-test-1',
      date: new Date().toISOString()
    });

    expect(billPostedCalls).toHaveLength(1);
    expect(billRevertedCalls).toHaveLength(0);
  });
});

describe('Ledger Integration Service', () => {
  let ledgerService: LedgerIntegrationService;
  let eventBus: DomainEventBus;
  let activityLogService: ActivityLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventBus,
        LedgerIntegrationService,
        ActivityLogService
      ],
    }).compile();

    ledgerService = module.get<LedgerIntegrationService>(LedgerIntegrationService);
    eventBus = module.get<DomainEventBus>(DomainEventBus);
    activityLogService = module.get<ActivityLogService>(ActivityLogService);
    
    // Initialize the service to subscribe to events
    await ledgerService.onModuleInit();
  });

  it('should be defined', () => {
    expect(ledgerService).toBeDefined();
  });

  it('should create journal entry when bill is posted', () => {
    eventBus.publish({
      type: 'billPosted',
      billId: 'bill-123',
      supplierId: 'SUP-1',
      totalNetAmount: 200,
      originalReference: 'Bill-bill-123',
      date: new Date().toISOString()
    });

    const workflow = ledgerService.explainBillWorkflow('bill-123');
    expect(workflow.journalEntries).toHaveLength(1);
    const only = workflow.journalEntries.find((e) => e.kind === 'ORIGINAL');
    expect(only?.amount).toBe(200);
  });

  it('should create storno entry when bill revert is requested', () => {
    // First post
    eventBus.publish({
      type: 'billPosted',
      billId: 'bill-456',
      supplierId: 'SUP-1',
      totalNetAmount: 300,
      originalReference: 'Bill-bill-456',
      date: new Date().toISOString()
    });

    // Saga step 1: request revert
    eventBus.publish({
      type: 'billRevertRequested',
      billId: 'bill-456',
      originalReference: 'Bill-bill-456',
      date: new Date().toISOString(),
      reason: 'Test reversal'
    });

    const workflow = ledgerService.explainBillWorkflow('bill-456');
    expect(workflow.journalEntries).toHaveLength(2);
    const original = workflow.journalEntries.find((e) => e.kind === 'ORIGINAL');
    const storno = workflow.journalEntries.find((e) => e.kind === 'STORNO');
    expect(original?.amount).toBe(300);
    expect(storno?.amount).toBe(300);
  });

  it('should swap debits and credits in storno entry', () => {
    eventBus.publish({
      type: 'billPosted',
      billId: 'bill-789',
      supplierId: 'SUP-1',
      totalNetAmount: 150,
      originalReference: 'Bill-bill-789',
      date: new Date().toISOString()
    });

    eventBus.publish({
      type: 'billRevertRequested',
      billId: 'bill-789',
      originalReference: 'Bill-bill-789',
      date: new Date().toISOString(),
      reason: 'Credit swap test'
    });

    const workflow = ledgerService.explainBillWorkflow('bill-789');
    const original = workflow.journalEntries.find((e) => e.kind === 'ORIGINAL')!;
    const storno = workflow.journalEntries.find((e) => e.kind === 'STORNO')!;

    // Verify storno swaps debits and credits
    expect(storno.lines).toHaveLength(original.lines.length);
    
    for (let i = 0; i < original.lines.length; i++) {
      expect(storno.lines[i].debit).toBe(original.lines[i].credit);
      expect(storno.lines[i].credit).toBe(original.lines[i].debit);
    }
  });
});

describe('AI Financial Snapshot Service', () => {
  let aiService: AiFinancialSnapshotService;
  let eventBus: DomainEventBus;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainEventBus,
        AiFinancialSnapshotService
      ],
    }).compile();

    aiService = module.get<AiFinancialSnapshotService>(AiFinancialSnapshotService);
    eventBus = module.get<DomainEventBus>(DomainEventBus);
    
    // Initialize the service to subscribe to events
    await aiService.onModuleInit();
  });

  it('should be defined', () => {
    expect(aiService).toBeDefined();
  });

  it('should start with zero total expenses', () => {
    const snapshot = aiService.getSnapshot();
    expect(snapshot.totalExpenses).toBe(0);
  });

  it('should increase expenses when journal entry is posted', () => {
    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-1',
      reference: 'Bill-123',
      deltaExpenses: 500,
      date: new Date().toISOString()
    });

    const snapshot = aiService.getSnapshot();
    expect(snapshot.totalExpenses).toBe(500);
  });

  it('should decrease expenses when storno journal entry is posted', () => {
    // Post original
    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-2',
      reference: 'Bill-456',
      deltaExpenses: 300,
      date: new Date().toISOString()
    });

    // Post storno (negative delta)
    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-2-storno',
      reference: 'STORNO-Bill-456',
      deltaExpenses: -300,
      date: new Date().toISOString()
    });

    const snapshot = aiService.getSnapshot();
    expect(snapshot.totalExpenses).toBe(0);
  });

  it('should accumulate multiple journal entries', () => {
    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-3',
      reference: 'Bill-789',
      deltaExpenses: 100,
      date: new Date().toISOString()
    });

    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-4',
      reference: 'Bill-890',
      deltaExpenses: 250,
      date: new Date().toISOString()
    });

    eventBus.publish({
      type: 'journalEntryPosted',
      journalEntryId: 'je-5',
      reference: 'Bill-901',
      deltaExpenses: 150,
      date: new Date().toISOString()
    });

    const snapshot = aiService.getSnapshot();
    expect(snapshot.totalExpenses).toBe(500);
  });
});
