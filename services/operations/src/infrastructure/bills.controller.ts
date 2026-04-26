import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { BillService } from '../application/bills/bill.service';
import { BillStatus } from '../domain/bills/fatura-hyrese.aggregate';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('bills')
export class BillsController {
  constructor(private readonly svc: BillService) {}
  private tenant(tenantId?: string): string { return tenantId || 'public'; }

  @Get()    list(@Headers('x-tenant-id') t: string, @Query('status') status?: BillStatus)        { return this.svc.listBills(this.tenant(t), status).then((bs: any[]) => bs.map(b => this.shape(b))); }
  @Post()   create(@Headers('x-tenant-id') t: string, @Body() dto: any)                           { return this.svc.createBill(this.tenant(t), dto).then(this.shape); }
  @Get(':id')    get(@Headers('x-tenant-id') t: string, @Param('id') id: string)                  { return this.svc.getBill(this.tenant(t), id).then(this.shape); }
  @Post(':id/post') post(@Headers('x-tenant-id') t: string, @Param('id') id: string)              { return this.svc.postBill(this.tenant(t), id).then(this.shape); }
  @Post(':id/pay') pay(@Headers('x-tenant-id') t: string, @Param('id') id: string)                { return this.svc.payBill(this.tenant(t), id).then(this.shape); }
  @Post(':id/reverse') reverse(@Headers('x-tenant-id') t: string, @Param('id') id: string, @Body() dto: StornoDto) { return this.svc.reverseBill(this.tenant(t), id, dto?.reason ?? '').then(this.shape); }

  private shape(bill: any) {
    return { id: bill.id, supplierId: bill.supplierId, issueDate: bill.issueDate, dueDate: bill.dueDate, currency: bill.currency, status: bill.status, totalNetAmount: bill.totalNetAmount, lines: bill.lines.map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, accountCode: l.accountCode, isInventoryItem: Boolean(l.isInventoryItem), sku: l.sku, netAmount: l.netAmount })) };
  }
}
