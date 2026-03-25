import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
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

  private tenant(tenantId?: string): string { return tenantId || 'public'; }

  @Get('activities')
  listActivities(@Headers('x-tenant-id') t: string, @Query('limit') limit?: string) { return this.activityLog.list(this.tenant(t), limit ? Number(limit) : 20); }

  @Post('storno')
  async storno(@Headers('x-tenant-id') t: string, @Body() dto: { entityType: string; entityId: string; reason: string }) {
    const tenantId = this.tenant(t);
    if (dto.entityType === 'bill') {
      const bill = await this.billService.reverseBill(tenantId, dto.entityId, dto.reason);
      return {
        id: bill.id, supplierId: bill.supplierId, issueDate: bill.issueDate,
        currency: bill.currency, status: bill.status, totalNetAmount: bill.totalNetAmount,
        lines: bill.lines.map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, netAmount: l.netAmount })),
        workflow: { event: { type: 'billReverted', payload: { OriginalReference: `Bill-${bill.id}`, Date: new Date().toISOString(), Reason: dto.reason } } },
      };
    }
    if (dto.entityType === 'invoice') {
      const invoice = await this.invoiceService.reverse(tenantId, dto.entityId, dto.reason);
      return { ...invoice, totalNetAmount: this.invoiceService.totalNetAmount(invoice) };
    }
    return this.inventoryService.reverseMovement(tenantId, dto.entityId, dto.reason);
  }
}
