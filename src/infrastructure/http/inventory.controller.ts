import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RecordInventoryMovementDto } from '../../application/inventory/dto/record-inventory-movement.dto';
import { InventoryService } from '../../application/inventory/inventory.service';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../iam/guards/auth.guard';

class StornoDto {
  @IsOptional()
  @IsString()
  reason!: string;
}

@Public()

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('movements')
  recordMovement(@Body() dto: RecordInventoryMovementDto) {
    return this.inventoryService.recordMovement(dto);
  }

  @Post('movements/:id/reverse')
  reverseMovement(@Param('id') id: string, @Body() dto: StornoDto) {
    return this.inventoryService.reverseMovement(id, dto?.reason ?? '');
  }

  @Get('valuation')
  getValuation() {
    return this.inventoryService.getValuation();
  }
}
