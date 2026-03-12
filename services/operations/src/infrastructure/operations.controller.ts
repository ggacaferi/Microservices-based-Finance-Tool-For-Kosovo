import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillService } from '../application/bills/bill.service';
import { InvoiceService } from '../application/invoices/invoice.service';
import { InventoryService } from '../application/inventory/inventory.service';
import { ActivityLogService } from '../application/operations/activity-log.service';

@Controller('operations')
export class OperationsController {
  constructor(
    private readonly billService: BillService,
    private readonly invoiceService: InvoiceService,
    private readonly inventoryService: InventoryService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get('activities')
  listActivities(@Query('limit') limit?: string) { return this.activityLog.list(limit ? Number(limit) : 20); }

  @Post('storno')
  async storno(@Body() dto: { entityType: string; entityId: string; reason: string }) {
    if (dto.entityType === 'bill') {
      const bill = await this.billService.reverseBill(dto.entityId, dto.reason);
      return {
        id: bill.id, supplierId: bill.supplierId, issueDate: bill.issueDate,
        currency: bill.currency, status: bill.status, totalNetAmount: bill.totalNetAmount,
        lines: bill.lines.map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, netAmount: l.netAmount })),
        workflow: { event: { type: 'billReverted', payload: { OriginalReference: `Bill-${bill.id}`, Date: new Date().toISOString(), Reason: dto.reason } } },
      };
    }
    if (dto.entityType === 'invoice') {
      const invoice = await this.invoiceService.reverse(dto.entityId, dto.reason);
      return { ...invoice, totalNetAmount: this.invoiceService.totalNetAmount(invoice) };
    }
    return this.inventoryService.reverseMovement(dto.entityId, dto.reason);
  }
}
