import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class StornoDto {
  @IsIn(['bill', 'invoice', 'inventory'])
  entityType!: 'bill' | 'invoice' | 'inventory';

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
