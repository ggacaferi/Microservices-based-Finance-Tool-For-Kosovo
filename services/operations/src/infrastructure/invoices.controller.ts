import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { InvoiceService } from '../application/invoices/invoice.service';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoiceService) {}
  private tenant(tenantId?: string): string { return tenantId || 'public'; }

  @Get()               list(@Headers('x-tenant-id') t: string)                                               { return this.svc.list(this.tenant(t)).map((i: any) => ({ ...i, totalNetAmount: this.svc.totalNetAmount(i) })); }
  @Post()              create(@Headers('x-tenant-id') t: string, @Body() b: any)                               { return this.svc.createDraft(this.tenant(t), b); }
  @Get(':id')          get(@Headers('x-tenant-id') t: string, @Param('id') id: string)                         { return this.svc.get(this.tenant(t), id); }
  @Post(':id/send')    send(@Headers('x-tenant-id') t: string, @Param('id') id: string)                        { return this.svc.send(this.tenant(t), id); }
  @Post(':id/pay')     pay(@Headers('x-tenant-id') t: string, @Param('id') id: string)                         { return this.svc.pay(this.tenant(t), id); }
  @Post(':id/reverse') reverse(@Headers('x-tenant-id') t: string, @Param('id') id: string, @Body() b: StornoDto) { return this.svc.reverse(this.tenant(t), id, b?.reason ?? ''); }
}
