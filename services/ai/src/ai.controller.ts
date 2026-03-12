import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiService, JournalEntryPostedEvent } from './ai.service';
import { IsNotEmpty, IsString } from 'class-validator';

class NlQueryDto { @IsString() @IsNotEmpty() query!: string; }

@Controller('ai')
export class AiController {
  constructor(private readonly svc: AiService) {}

  /** Event receiver — called by Ledger Service after every journal entry posted */
  @Post('events')
  receiveEvent(@Body() event: JournalEntryPostedEvent) { this.svc.ingestEvent(event); return { ok: true }; }

  @Get('snapshot')      getSnapshot()                           { return this.svc.getSnapshot(); }
  @Post('query')        query(@Body() dto: NlQueryDto)          { return this.svc.processNaturalLanguageQuery(dto.query); }
  @Get('insights')      getInsights(@Query('limit') l?: string) { return this.svc.getInsights(l ? Number(l) : 20); }
  @Get('event-history') getHistory()                            { return this.svc.getHistory(); }
}
