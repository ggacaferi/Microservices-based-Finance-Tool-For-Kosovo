import { Module, Controller, Get } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './application/auth.service';
import { IamController } from './infrastructure/iam.controller';
import { UserRepository } from './infrastructure/user.repository';
import { TenantRepository } from './infrastructure/tenant.repository';
import { UserOrmEntity } from './infrastructure/user.orm-entity';
import { TenantOrmEntity } from './infrastructure/tenant.orm-entity';
import { JwtAuthGuard, IS_PUBLIC_KEY } from './guards/auth.guard';
import { SetMetadata } from '@nestjs/common';

@Controller('health')
class HealthController {
  @Get() @SetMetadata(IS_PUBLIC_KEY, true)
  check() { return { status: 'ok', service: 'iam' }; }
}

const host = process.env.IAM_DB_HOST || process.env.POSTGRES_HOST;

@Module({
  imports: [
    ...(host ? [
      TypeOrmModule.forRoot({
        name: 'iam',
        type: 'postgres',
        host,
        port: parseInt(process.env.IAM_DB_PORT || '5432', 10),
        username: process.env.IAM_DB_USER || 'guri',
        password: process.env.IAM_DB_PASSWORD || 'guri',
        database: process.env.IAM_DB_NAME || 'guri_iam',
        entities: [UserOrmEntity, TenantOrmEntity],
        synchronize: process.env.NODE_ENV !== 'production',
      }),
      TypeOrmModule.forFeature([UserOrmEntity, TenantOrmEntity], 'iam'),
    ] : []),
  ],
  controllers: [IamController, HealthController],
  providers: [
    AuthService,
    UserRepository,
    TenantRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
