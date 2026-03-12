import {
  IsArray,
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

