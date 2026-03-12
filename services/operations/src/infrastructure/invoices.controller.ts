import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InvoiceService } from '../application/invoices/invoice.service';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoiceService) {}

  @Get()               list()                                               { return this.svc.list().map((i: any) => ({ ...i, totalNetAmount: this.svc.totalNetAmount(i) })); }
  @Post()              create(@Body() b: any)                               { return this.svc.createDraft(b); }
  @Get(':id')          get(@Param('id') id: string)                         { return this.svc.get(id); }
  @Post(':id/send')    send(@Param('id') id: string)                        { return this.svc.send(id); }
  @Post(':id/pay')     pay(@Param('id') id: string)                         { return this.svc.pay(id); }
  @Post(':id/reverse') reverse(@Param('id') id: string, @Body() b: StornoDto) { return this.svc.reverse(id, b?.reason ?? ''); }
}
