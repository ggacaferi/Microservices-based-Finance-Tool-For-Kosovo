import { Controller, Get, Post, Query } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('summary')          getSummary()                                          { return this.svc.getSummary(); }
  @Get('tax-categories')   getTaxCategories()                                    { return this.svc.getTaxCategories(); }
  @Get('chart-of-accounts') getChartOfAccounts(@Query('type') type?: string)    { return type ? this.svc.getAccountsByType(type.toUpperCase() as any) : this.svc.getChartOfAccounts(); }
  @Get('rules')            getRules(@Query('context') context?: string)          { return this.svc.getRules(context); }
  @Get('bundle')           getBundle()                                           { return this.svc.getBundle(); }
  @Post('refresh')         refresh()                                             { this.svc.refreshCache(); return { message: 'Refreshed.', ...this.svc.getSummary() }; }
}
