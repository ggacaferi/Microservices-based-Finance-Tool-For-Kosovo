import { Controller, Get, Post, Query } from '@nestjs/common';
import { ComplianceService } from '../application/compliance.service';
import { Public } from '../../iam/guards/auth.guard';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  /**
   * GET /api/v1/compliance/summary — Cache status overview
   */
  @Public()
  @Get('summary')
  getSummary() {
    return this.complianceService.getSummary();
  }

  /**
   * GET /api/v1/compliance/tax-categories — All Kosovo VAT categories
   */
  @Public()
  @Get('tax-categories')
  getTaxCategories() {
    return this.complianceService.getTaxCategories();
  }

  /**
   * GET /api/v1/compliance/chart-of-accounts — Kosovo SKA
   */
  @Public()
  @Get('chart-of-accounts')
  getChartOfAccounts(@Query('type') type?: string) {
    if (type) {
      return this.complianceService.getAccountsByType(
        type.toUpperCase() as 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
      );
    }
    return this.complianceService.getChartOfAccounts();
  }

  /**
   * GET /api/v1/compliance/rules — Compliance rules, optional filter by context
   */
  @Public()
  @Get('rules')
  getRules(@Query('context') context?: string) {
    return this.complianceService.getRules(context);
  }

  /**
   * GET /api/v1/compliance/bundle — Full distribution bundle for other services
   */
  @Public()
  @Get('bundle')
  getBundle() {
    return this.complianceService.getDistributionBundle();
  }

  /**
   * POST /api/v1/compliance/refresh — Force cache refresh (simulates law update)
   */
  @Public()
  @Post('refresh')
  refreshCache() {
    this.complianceService.refreshCache();
    return { message: 'Compliance cache refreshed.', ...this.complianceService.getSummary() };
  }
}
