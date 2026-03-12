import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceModule } from './compliance/compliance.module';
import { TaxRuleService } from './domain/tax/tax-rule.service';
import { BillsController } from './infrastructure/http/bills.controller';
import { BillService } from './application/bills/bill.service';
import { BillRepository } from './infrastructure/persistence/bills/bill.repository';
import { BillOrmEntity } from './infrastructure/persistence/bills/bill.orm-entity';
import { InvoiceService } from './application/invoices/invoice.service';
import { InvoicesController } from './infrastructure/http/invoices.controller';
import { InventoryService } from './application/inventory/inventory.service';
import { InventoryController } from './infrastructure/http/inventory.controller';
import { ActivityLogService } from './application/operations/activity-log.service';
import { OperationsController } from './infrastructure/http/operations.controller';
import { DomainEventBus } from './application/events/domain-event.bus';
import { LedgerIntegrationService } from './application/ledger/ledger-integration.service';
import { JournalEntryOrmEntity } from './infrastructure/persistence/ledger/journal-entry.orm-entity';
import { AiFinancialSnapshotService } from './application/ai/ai-financial-snapshot.service';
import { AiEventOrmEntity } from './infrastructure/persistence/ai/ai-event.orm-entity';
import { LedgerController } from './infrastructure/http/ledger.controller';
import { AiController } from './infrastructure/http/ai.controller';
import {
  getOperationsDatabaseConfig,
  getLedgerDatabaseConfig,
  getAiDatabaseConfig,
} from './infrastructure/database/database.config';

const opsDbConfig = getOperationsDatabaseConfig();
const ledgerDbConfig = getLedgerDatabaseConfig();
const aiDbConfig = getAiDatabaseConfig();
const logger = new Logger('DailyOperationsModule');

/**
 * Daily Operations Module — Houses 3 bounded contexts
 *
 * Operations Service → Postgres (guri_operations) — bills, invoices, inventory
 * Ledger Service     → Postgres (guri_ledger)     — journal entries, trial balance
 * AI Service         → Postgres + pgvector (guri_ai) — financial events, embeddings
 *
 * Events flow via Google Cloud Pub/Sub (or in-memory bus for local dev).
 */
@Module({
  imports: [
    // Compliance rules are distributed once at startup via push (IComplianceSubscriber).
    // DailyOperationsModule services never call ComplianceService per-transaction.
    ComplianceModule,
    // Operations DB (bills, invoices)
    ...(opsDbConfig
      ? [TypeOrmModule.forRoot({ ...opsDbConfig, name: 'operations' }),
         TypeOrmModule.forFeature([BillOrmEntity], 'operations')]
      : []),
    // Ledger DB (journal entries)
    ...(ledgerDbConfig
      ? [TypeOrmModule.forRoot({ ...ledgerDbConfig, name: 'ledger' }),
         TypeOrmModule.forFeature([JournalEntryOrmEntity], 'ledger')]
      : []),
    // AI DB (pgvector events)
    ...(aiDbConfig
      ? [TypeOrmModule.forRoot({ ...aiDbConfig, name: 'ai' }),
         TypeOrmModule.forFeature([AiEventOrmEntity], 'ai')]
      : []),
  ],
  controllers: [
    BillsController,
    InvoicesController,
    InventoryController,
    OperationsController,
    LedgerController,
    AiController
  ],
  providers: [
    TaxRuleService,
    BillService,
    BillRepository,
    InvoiceService,
    InventoryService,
    ActivityLogService,
    DomainEventBus,
    LedgerIntegrationService,
    AiFinancialSnapshotService
  ],
  exports: [DomainEventBus, ActivityLogService, LedgerIntegrationService, AiFinancialSnapshotService]
})
export class DailyOperationsModule {
  constructor() {
    if (opsDbConfig) logger.log(`✅ Operations Postgres → ${opsDbConfig.database}`);
    else logger.log('📦 Operations using in-memory (set OPS_DB_HOST for Postgres)');

    if (ledgerDbConfig) logger.log(`✅ Ledger Postgres → ${ledgerDbConfig.database}`);
    else logger.log('📦 Ledger using in-memory (set LEDGER_DB_HOST for Postgres)');

    if (aiDbConfig) logger.log(`✅ AI pgvector Postgres → ${aiDbConfig.database}`);
    else logger.log('📦 AI using in-memory (set AI_DB_HOST for Postgres+pgvector)');
  }
}

