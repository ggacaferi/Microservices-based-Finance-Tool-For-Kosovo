import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsIn, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../domain/user.entity';

export class RegisterTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^8\d{8}$/, { message: 'NUI is incorrect' })
  nui!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;
}

export class VerifyRegistrationDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class VerifyPasswordResetDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsIn(['admin', 'accountant', 'data_clerk', 'auditor'])
  role!: UserRole;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tenantName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @Matches(/^8\d{8}$/, { message: 'NUI is incorrect' })
  nui?: string;
}
