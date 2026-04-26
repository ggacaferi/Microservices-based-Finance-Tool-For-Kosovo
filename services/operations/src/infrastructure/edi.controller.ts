import { Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { EdiInboxService } from '../application/edi/edi-inbox.service';

@Controller('edi')
export class EdiController {
  constructor(private readonly ediService: EdiInboxService) {}

  private tenant(t?: string): string { return t || 'public'; }

  /** GET /api/v1/edi/inbox — list incoming EDI documents for this tenant */
  @Get('inbox')
  listInbox(@Headers('x-tenant-id') t: string) {
    return this.ediService.listForTenant(this.tenant(t));
  }

  /** POST /api/v1/edi/inbox/:id/import-to-bill — accept document → create bill */
  @Post('inbox/:id/import-to-bill')
  importToBill(@Headers('x-tenant-id') t: string, @Param('id') id: string) {
    return this.ediService.importToBill(this.tenant(t), id);
  }
}
