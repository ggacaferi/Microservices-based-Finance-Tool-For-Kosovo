import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { InventoryService } from '../application/inventory/inventory.service';
import { IsOptional, IsString } from 'class-validator';

class StornoDto { @IsOptional() @IsString() reason!: string; }

@Controller('inventory')
export class InventoryController {
  constructor(private readonly svc: InventoryService) {}
  private tenant(tenantId?: string): string { return tenantId || 'public'; }

  @Post('movements/')              record(@Headers('x-tenant-id') t: string, @Body() b: any)                                      { return this.svc.recordMovement(this.tenant(t), b); }
  @Post('movements/:id/reverse')   reverse(@Headers('x-tenant-id') t: string, @Param('id') id: string, @Body() b: StornoDto)     { return this.svc.reverseMovement(this.tenant(t), id, b?.reason ?? ''); }
  @Get('valuation')                valuation(@Headers('x-tenant-id') t: string)                                                  { return this.svc.getValuation(this.tenant(t)); }
}
