import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { ComplianceService } from './compliance.service';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly svc: ComplianceService) {}

  @Get('summary')          getSummary()                                          { return this.svc.getSummary(); }
  @Get('tax-categories')   getTaxCategories(@Headers('x-lang') lang?: string)                                    { return this.svc.getTaxCategories(lang); }
  @Get('chart-of-accounts') getChartOfAccounts(@Headers('x-lang') lang?: string, @Query('type') type?: string)  { return type ? this.svc.getAccountsByType(type.toUpperCase() as any, lang) : this.svc.getChartOfAccounts(lang); }
  @Get('rules')            getRules(@Headers('x-lang') lang?: string, @Query('context') context?: string)        { return this.svc.getRules(context, lang); }
  @Get('bundle')           getBundle(@Headers('x-lang') lang?: string)                                           { return this.svc.getBundle(lang); }
  @Post('validate')        validate(@Query('context') context: string, @Body() payload: any) { return this.svc.validate(context, payload); }
  @Post('refresh')         refresh()                                             { this.svc.refreshCache(); return { message: 'Refreshed.', ...this.svc.getSummary() }; }
}
