import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InventoryService } from '../application/inventory/inventory.service';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}

  @Post('movements/')              record(@Body() b: any)                                      { return this.svc.recordMovement(b); }
  @Post('movements/:id/reverse')   reverse(@Param('id') id: string, @Body() b: StornoDto)     { return this.svc.reverseMovement(id, b?.reason ?? ''); }
  @Get('valuation')                valuation()                                                  { return this.svc.getValuation(); }
}
