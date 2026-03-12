import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class RecordInventoryMovementDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsIn(['RECEIPT', 'ISSUE'])
  type!: 'RECEIPT' | 'ISSUE';

  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
