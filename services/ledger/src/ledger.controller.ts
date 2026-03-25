import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { LedgerService, IncomingEvent } from './ledger.service';
import { Res } from '@nestjs/common';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly svc: LedgerService) {}
  private tenant(tenantId?: string): string { return tenantId || 'public'; }

  /** Event receiver — called by Operations Service and Ledger itself (AI notification) */
  @Post('events')
  receiveEvent(@Body() event: IncomingEvent) { return this.svc.handleEvent(event); }

  @Get('journal-entries')
  getEntries(@Headers('x-tenant-id') t: string, @Query('kind') kind?: string) { return this.svc.getAllEntries(this.tenant(t), kind); }

  @Get('journal-entries/:id')
  getEntry(@Headers('x-tenant-id') t: string, @Param('id') id: string) { const e = this.svc.getEntryById(this.tenant(t), id); return e ?? { error: `Journal entry ${id} not found` }; }

  @Get('bill/:billId')
  getBillWorkflow(@Headers('x-tenant-id') t: string, @Param('billId') billId: string) { return this.svc.explainBillWorkflow(this.tenant(t), billId); }

  @Get('trial-balance')
  getTrialBalance(@Headers('x-tenant-id') t: string) { return this.svc.getTrialBalance(this.tenant(t)); }

  @Get('summary')
  getSummary(@Headers('x-tenant-id') t: string) { return this.svc.getSummary(this.tenant(t)); }

  @Get('reports/profit-loss')
  downloadProfitLoss(
    @Headers('x-tenant-id') t: string,
    @Query('year') year?: string,
    @Query('quarter') quarter?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    const now = new Date();
    const y = Number(year) || now.getUTCFullYear();
    const q = Math.min(4, Math.max(1, Number(quarter) || Math.floor(now.getUTCMonth() / 3) + 1));
    const csv = this.svc.generateProfitLossCsv(this.tenant(t), y, q);
    res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res?.setHeader('Content-Disposition', `attachment; filename="tak-profit-loss-Q${q}-${y}.csv"`);
    return csv;
  }

  @Get('reports/balance-sheet')
  downloadBalanceSheet(
    @Headers('x-tenant-id') t: string,
    @Query('year') year?: string,
    @Query('quarter') quarter?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    const now = new Date();
    const y = Number(year) || now.getUTCFullYear();
    const q = Math.min(4, Math.max(1, Number(quarter) || Math.floor(now.getUTCMonth() / 3) + 1));
    const csv = this.svc.generateBalanceSheetCsv(this.tenant(t), y, q);
    res?.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res?.setHeader('Content-Disposition', `attachment; filename="tak-balance-sheet-Q${q}-${y}.csv"`);
    return csv;
  }
}
