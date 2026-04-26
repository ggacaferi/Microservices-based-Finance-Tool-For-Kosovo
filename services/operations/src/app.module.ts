import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceClient } from './compliance/compliance.client';
import { CrossServiceEventPublisher } from './events/cross-service-event.publisher';
import { BillOrmEntity } from './infrastructure/persistence/bills/bill.orm-entity';
import { InvoiceOrmEntity } from './infrastructure/persistence/invoices/invoice.orm-entity';
import { InventoryMovementOrmEntity } from './infrastructure/persistence/inventory/inventory-movement.orm-entity';
import { OutboxEventOrmEntity } from './infrastructure/persistence/events/outbox-event.orm-entity';
import { EdiInboxOrmEntity } from './infrastructure/persistence/edi/edi-inbox.orm-entity';
import { BillRepository } from './infrastructure/bill.repository';
import { BillService } from './application/bills/bill.service';
import { InvoiceService } from './application/invoices/invoice.service';
import { EdiInboxService } from './application/edi/edi-inbox.service';
import { InventoryService } from './application/inventory/inventory.service';
import { ActivityLogService } from './application/operations/activity-log.service';
import { BillsController } from './infrastructure/bills.controller';
import { InvoicesController } from './infrastructure/invoices.controller';
import { InventoryController } from './infrastructure/inventory.controller';
import { OperationsController } from './infrastructure/operations.controller';
import { EdiController } from './infrastructure/edi.controller';
import { IamTenantLookupService } from './integrations/iam-tenant.lookup';

const host = process.env.OPS_DB_HOST || process.env.POSTGRES_HOST;
const entities = [BillOrmEntity, InvoiceOrmEntity, InventoryMovementOrmEntity, OutboxEventOrmEntity, EdiInboxOrmEntity];

@Module({
  imports: [
    ...(host ? [
      TypeOrmModule.forRoot({ name: 'operations', type: 'postgres', host, port: parseInt(process.env.OPS_DB_PORT || '5432', 10), username: process.env.OPS_DB_USER || 'guri', password: process.env.OPS_DB_PASSWORD || 'guri', database: process.env.OPS_DB_NAME || 'guri_operations', entities, synchronize: process.env.NODE_ENV !== 'production' }),
      TypeOrmModule.forFeature(entities, 'operations'),
    ] : []),
  ],
  controllers: [BillsController, InvoicesController, InventoryController, OperationsController, EdiController],
  providers: [ComplianceClient, CrossServiceEventPublisher, BillRepository, BillService, EdiInboxService, IamTenantLookupService, InvoiceService, InventoryService, ActivityLogService],
})
export class AppModule {}
