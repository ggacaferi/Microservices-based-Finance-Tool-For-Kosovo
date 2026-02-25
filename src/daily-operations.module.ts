import { Module } from '@nestjs/common';
import { TaxRuleService } from './domain/tax/tax-rule.service';
import { BillsController } from './infrastructure/http/bills.controller';
import { BillService } from './application/bills/bill.service';
import { BillRepository } from './infrastructure/persistence/bills/bill.repository';
import { InvoiceService } from './application/invoices/invoice.service';
import { InvoicesController } from './infrastructure/http/invoices.controller';
import { InventoryService } from './application/inventory/inventory.service';
import { InventoryController } from './infrastructure/http/inventory.controller';
import { ActivityLogService } from './application/operations/activity-log.service';
import { OperationsController } from './infrastructure/http/operations.controller';
import { DomainEventBus } from './application/events/domain-event.bus';
import { LedgerIntegrationService } from './application/ledger/ledger-integration.service';
import { AiFinancialSnapshotService } from './application/ai/ai-financial-snapshot.service';

@Module({
  imports: [],
  controllers: [
    BillsController,
    InvoicesController,
    InventoryController,
    OperationsController
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
  ]
})
export class DailyOperationsModule {}

