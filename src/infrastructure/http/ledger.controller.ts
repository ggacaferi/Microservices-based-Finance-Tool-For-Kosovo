import { Controller, Get, Param, Query } from '@nestjs/common';
import { LedgerIntegrationService, JournalEntry } from '../../application/ledger/ledger-integration.service';
import { Public } from '../../iam/guards/auth.guard';

@Public()
@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerIntegrationService) {}

  /**
   * GET /api/v1/ledger/journal-entries — All journal entries
   */
  @Get('journal-entries')
  getAllEntries(@Query('kind') kind?: 'ORIGINAL' | 'STORNO'): JournalEntry[] {
    const all = this.ledgerService.getAllEntries();
    if (kind) return all.filter((e) => e.kind === kind);
    return all;
  }

  /**
   * GET /api/v1/ledger/journal-entries/:id — Single entry by ID
   */
  @Get('journal-entries/:id')
  getEntry(@Param('id') id: string): JournalEntry | { error: string } {
    const entry = this.ledgerService.getEntryById(id);
    if (!entry) return { error: `Journal entry ${id} not found` };
    return entry;
  }

  /**
   * GET /api/v1/ledger/bill/:billId — All journal entries for a bill
   */
  @Get('bill/:billId')
  getBillWorkflow(@Param('billId') billId: string) {
    return this.ledgerService.explainBillWorkflow(billId);
  }

  /**
   * GET /api/v1/ledger/trial-balance — Simplified trial balance from journal entries
   */
  @Get('trial-balance')
  getTrialBalance() {
    return this.ledgerService.getTrialBalance();
  }

  /**
   * GET /api/v1/ledger/summary — High-level ledger statistics
   */
  @Get('summary')
  getSummary() {
    return this.ledgerService.getSummary();
  }
}
