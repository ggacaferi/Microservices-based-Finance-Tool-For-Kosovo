import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { BillService } from '../../application/bills/bill.service';
import { CreateBillDto } from '../../application/bills/dto/create-bill.dto';
import { BillStatus } from '../../domain/bills/fatura-hyrese.aggregate';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../iam/guards/auth.guard';

class StornoDto {
  @IsOptional()
  @IsString()
  reason!: string;
}

@Public()
@Controller('bills')
export class BillsController {
  constructor(private readonly billService: BillService) {}

  @Get()
  async listBills(@Query('status') status?: BillStatus) {
    const bills = await this.billService.listBills(status);
    return bills.map((bill) => this.toResponse(bill));
  }

  @Post()
  async createBill(@Body() dto: CreateBillDto) {
    const bill = await this.billService.createBill(dto);
    return this.toResponse(bill);
  }

  @Post(':id/post')
  async postBill(@Param('id') id: string) {
    const bill = await this.billService.postBill(id);
    return this.toResponse(bill);
  }

  @Post(':id/reverse')
  async reverseBill(@Param('id') id: string, @Body() dto: StornoDto) {
    const bill = await this.billService.reverseBill(id, dto?.reason ?? '');
    return this.toResponse(bill);
  }

  @Get(':id')
  async getBill(@Param('id') id: string) {
    const bill = await this.billService.getBill(id);
    return this.toResponse(bill);
  }

  private toResponse(bill: any) {
    return {
      id: bill.id,
      supplierId: bill.supplierId,
      issueDate: bill.issueDate,
      dueDate: bill.dueDate,
      currency: bill.currency,
      status: bill.status,
      totalNetAmount: bill.totalNetAmount,
      lines: bill.lines.map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxCategoryId: l.taxCategoryId,
        netAmount: l.netAmount
      }))
    };
  }
}

