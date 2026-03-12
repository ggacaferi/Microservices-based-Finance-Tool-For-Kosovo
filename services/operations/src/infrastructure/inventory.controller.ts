import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InventoryService } from '../application/inventory/inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Post('movements')             recordMovement(@Body() dto: any) { return this.svc.recordMovement(dto); }
  @Post('movements/:id/reverse') reverse(@Param('id') id: string, @Body() dto: any) { return this.svc.reverseMovement(id, dto?.reason ?? ''); }
  @Get('valuation')              getValuation() { return this.svc.getValuation(); }
}
