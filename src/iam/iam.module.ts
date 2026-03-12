import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './application/auth.service';
import { UserRepository } from './infrastructure/user.repository';
import { TenantRepository } from './infrastructure/tenant.repository';
import { IamController } from './infrastructure/iam.controller';
import { JwtAuthGuard, RolesGuard, TenantGuard } from './guards/auth.guard';
import { UserOrmEntity } from './infrastructure/user.orm-entity';
import { TenantOrmEntity } from './infrastructure/tenant.orm-entity';
import { getIamDatabaseConfig } from '../infrastructure/database/database.config';

const iamDbConfig = getIamDatabaseConfig();
const logger = new Logger('IamModule');

/**
 * IAM Bounded Context Module
 *
 * Database: Postgres (guri_iam) — stores users, tenants, credentials
 * Falls back to in-memory when POSTGRES_HOST / IAM_DB_HOST is not set.
 */
@Module({
  imports: [
    // Conditionally register TypeORM for IAM's own Postgres database
    ...(iamDbConfig
      ? [TypeOrmModule.forRoot({ ...iamDbConfig, name: 'iam' }),
         TypeOrmModule.forFeature([UserOrmEntity, TenantOrmEntity], 'iam')]
      : []),
  ],
  controllers: [IamController],
  providers: [
    AuthService,
    UserRepository,
    TenantRepository,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
  exports: [AuthService, UserRepository, TenantRepository],
})
export class IamModule {
  constructor() {
    if (iamDbConfig) {
      logger.log(`✅ IAM Postgres connected → ${iamDbConfig.database}@${(iamDbConfig as any).host}`);
    } else {
      logger.log('📦 IAM using in-memory store (set IAM_DB_HOST for Postgres)');
    }
  }
}
