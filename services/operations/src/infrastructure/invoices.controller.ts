import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InvoiceService } from '../application/invoices/invoice.service';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoiceService) {}

  @Get()              list()                                          { return this.svc.list().map((i: any) => ({ ...i, totalNetAmount: this.svc.totalNetAmount(i) })); }
  @Post()             create(@Body() dto: any)                         { const i = this.svc.createDraft(dto); return { ...i, totalNetAmount: this.svc.totalNetAmount(i) }; }
  @Get(':id')         get(@Param('id') id: string)                     { const i = this.svc.get(id); return { ...i, totalNetAmount: this.svc.totalNetAmount(i) }; }
  @Post(':id/send')   send(@Param('id') id: string)                    { const i = this.svc.send(id); return { ...i, totalNetAmount: this.svc.totalNetAmount(i) }; }
  @Post(':id/pay')    pay(@Param('id') id: string)                     { const i = this.svc.pay(id); return { ...i, totalNetAmount: this.svc.totalNetAmount(i) }; }
  @Post(':id/reverse') reverse(@Param('id') id: string, @Body() dto: StornoDto) { const i = this.svc.reverse(id, dto?.reason ?? ''); return { ...i, totalNetAmount: this.svc.totalNetAmount(i) }; }
}
