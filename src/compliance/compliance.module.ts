import { Module } from '@nestjs/common';
import { ComplianceService } from './application/compliance.service';
import { ComplianceController } from './infrastructure/compliance.controller';

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
