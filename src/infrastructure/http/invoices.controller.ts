import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateInvoiceDto } from '../../application/invoices/dto/create-invoice.dto';
import { InvoiceService } from '../../application/invoices/invoice.service';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../iam/guards/auth.guard';

class StornoDto {
  @IsOptional()
  @IsString()
  reason!: string;
}

@Public()
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  list() {
    return this.invoiceService.list().map((invoice) => this.toResponse(invoice));
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto) {
    const invoice = this.invoiceService.createDraft({
      customerId: dto.customerId,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      currency: dto.currency,
      lines: dto.lines
    });
    return this.toResponse(invoice);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.toResponse(this.invoiceService.get(id));
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.toResponse(this.invoiceService.send(id));
  }

  @Post(':id/pay')
  pay(@Param('id') id: string) {
    return this.toResponse(this.invoiceService.pay(id));
  }

  @Post(':id/reverse')
  reverse(@Param('id') id: string, @Body() dto: StornoDto) {
    return this.toResponse(this.invoiceService.reverse(id, dto?.reason ?? ''));
  }

  private toResponse(invoice: ReturnType<InvoiceService['get']>) {
    return {
      ...invoice,
      totalNetAmount: this.invoiceService.totalNetAmount(invoice)
    };
  }
}
