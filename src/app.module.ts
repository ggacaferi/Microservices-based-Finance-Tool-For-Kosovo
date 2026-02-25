import { Module } from '@nestjs/common';
import { HealthController } from './infrastructure/controllers/health.controller';
import { DailyOperationsModule } from './daily-operations.module';

/**
 * Root Application Module
 * For demo purposes, database is optional
 */
@Module({
  imports: [DailyOperationsModule],
  controllers: [HealthController],
  providers: [],
  exports: [],
})
export class AppModule {}
