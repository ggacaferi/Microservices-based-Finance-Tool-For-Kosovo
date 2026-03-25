import { BadRequestException, Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { AiService, JournalEntryPostedEvent } from './ai.service';
import { IsNotEmpty, IsString } from 'class-validator';

class NlQueryDto { @IsString() @IsNotEmpty() query!: string; }

@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  private tenantFromHeaders(tenantId?: string): string {
    if (!tenantId?.trim()) throw new BadRequestException('Missing x-tenant-id header');
    return tenantId.trim();
  }

  /** Event receiver — called by Ledger Service after every journal entry posted */
  @Post('events')
  receiveEvent(@Body() event: JournalEntryPostedEvent) { this.svc.ingestEvent(event); return { ok: true }; }

  @Get('snapshot')
  getSnapshot(@Headers('x-tenant-id') t?: string) { return this.svc.getSnapshot(this.tenantFromHeaders(t)); }

  @Post('query')
  async query(@Headers('x-tenant-id') t: string | undefined, @Body() dto: NlQueryDto) {
    return await this.svc.processNaturalLanguageQuery(this.tenantFromHeaders(t), dto.query);
  }

  @Get('insights')
  getInsights(@Headers('x-tenant-id') t: string | undefined, @Query('limit') l?: string) {
    return this.svc.getInsights(this.tenantFromHeaders(t), l ? Number(l) : 20);
  }

  @Get('event-history')
  getHistory(@Headers('x-tenant-id') t: string | undefined) { return this.svc.getHistory(this.tenantFromHeaders(t)); }
}
