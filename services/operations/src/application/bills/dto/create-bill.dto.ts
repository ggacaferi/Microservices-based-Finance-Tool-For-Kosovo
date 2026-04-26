import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString
} from 'class-validator';

export class CreateBillLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsString()
  @IsNotEmpty()
  taxCategoryId!: string;

  @IsOptional()
  @IsBoolean()
  isInventoryItem?: boolean;

  @IsOptional()
  @IsString()
  sku?: string;
}

export class CreateBillDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsDateString()
  issueDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsArray()
  lineItems!: CreateBillLineDto[];
}

