import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillService } from '../application/bills/bill.service';
import { BillStatus } from '../domain/bills/fatura-hyrese.aggregate';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('bills')
export class BillsController {
  constructor(private readonly svc: BillService) {}

  @Get()    list(@Query('status') status?: BillStatus)        { return this.svc.listBills(status).then((bs: any[]) => bs.map(b => this.shape(b))); }
  @Post()   create(@Body() dto: any)                           { return this.svc.createBill(dto).then(this.shape); }
  @Get(':id')    get(@Param('id') id: string)                  { return this.svc.getBill(id).then(this.shape); }
  @Post(':id/post') post(@Param('id') id: string)              { return this.svc.postBill(id).then(this.shape); }
  @Post(':id/reverse') reverse(@Param('id') id: string, @Body() dto: StornoDto) { return this.svc.reverseBill(id, dto?.reason ?? '').then(this.shape); }

  private shape(bill: any) {
    return { id: bill.id, supplierId: bill.supplierId, issueDate: bill.issueDate, dueDate: bill.dueDate, currency: bill.currency, status: bill.status, totalNetAmount: bill.totalNetAmount, lines: bill.lines.map((l: any) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, netAmount: l.netAmount })) };
  }
}
