import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LedgerService, IncomingEvent } from './ledger.service';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly svc: LedgerService) {}

  /** Event receiver — called by Operations Service and Ledger itself (AI notification) */
  @Post('events')
  receiveEvent(@Body() event: IncomingEvent) { return this.svc.handleEvent(event); }

  @Get('journal-entries')
  getEntries(@Query('kind') kind?: string) { return this.svc.getAllEntries(kind); }

  @Get('journal-entries/:id')
  getEntry(@Param('id') id: string) { const e = this.svc.getEntryById(id); return e ?? { error: `Journal entry ${id} not found` }; }

  @Get('bill/:billId')
  getBillWorkflow(@Param('billId') billId: string) { return this.svc.explainBillWorkflow(billId); }

  @Get('trial-balance')
  getTrialBalance() { return this.svc.getTrialBalance(); }

  @Get('summary')
  getSummary() { return this.svc.getSummary(); }
}
