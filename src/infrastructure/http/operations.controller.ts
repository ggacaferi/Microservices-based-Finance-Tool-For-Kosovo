import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillService } from '../../application/bills/bill.service';
import { InvoiceService } from '../../application/invoices/invoice.service';
import { InventoryService } from '../../application/inventory/inventory.service';
import { ActivityLogService } from '../../application/operations/activity-log.service';
import { CreateActivityDto } from '../../application/operations/dto/create-activity.dto';
import { StornoDto } from '../../application/operations/dto/storno.dto';
import { LedgerIntegrationService } from '../../application/ledger/ledger-integration.service';
import { AiFinancialSnapshotService } from '../../application/ai/ai-financial-snapshot.service';
import { Public } from '../../iam/guards/auth.guard';

@Public()
@Controller('operations')
export class OperationsController {
  constructor(
    private readonly billService: BillService,
    private readonly invoiceService: InvoiceService,
    private readonly inventoryService: InventoryService,
    private readonly activityLogService: ActivityLogService,
    private readonly ledgerIntegrationService: LedgerIntegrationService,
    private readonly aiFinancialSnapshotService: AiFinancialSnapshotService
  ) {}

  @Get('activities')
  listActivities(@Query('limit') limit?: string) {
    return this.activityLogService.list(limit ? Number(limit) : 20);
  }

  @Post('activities')
  createActivity(@Body() dto: CreateActivityDto) {
    return this.activityLogService.record(dto.type, {
      entityId: dto.entityId,
      summary: dto.summary
    });
  }

  @Post('storno')
  async storno(@Body() dto: StornoDto) {
    if (dto.entityType === 'bill') {
      const bill = await this.billService.reverseBill(dto.entityId, dto.reason);
      return {
        id: bill.id,
        supplierId: bill.supplierId,
        issueDate: bill.issueDate,
        dueDate: bill.dueDate,
        currency: bill.currency,
        status: bill.status,
        totalNetAmount: bill.totalNetAmount,
        lines: bill.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxCategoryId: line.taxCategoryId,
          netAmount: line.netAmount
        })),
        workflow: {
          event: {
            type: 'billReverted',
            payload: {
              OriginalReference: `Bill-${bill.id}`,
              Date: new Date().toISOString(),
              Reason: dto.reason
            }
          },
          ledger: this.ledgerIntegrationService.explainBillWorkflow(bill.id),
          aiSnapshot: this.aiFinancialSnapshotService.getSnapshot()
        }
      };
    }

    if (dto.entityType === 'invoice') {
      const invoice = this.invoiceService.reverse(dto.entityId, dto.reason);
      return {
        id: invoice.id,
        customerId: invoice.customerId,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        currency: invoice.currency,
        status: invoice.status,
        totalNetAmount: this.invoiceService.totalNetAmount(invoice),
        lines: invoice.lines
      };
    }

    return this.inventoryService.reverseMovement(dto.entityId, dto.reason);
  }

  @Get('financial-snapshot')
  getFinancialSnapshot() {
    return this.aiFinancialSnapshotService.getSnapshot();
  }
}
