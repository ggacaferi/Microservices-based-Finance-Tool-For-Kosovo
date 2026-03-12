import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiFinancialSnapshotService } from '../../application/ai/ai-financial-snapshot.service';
import { Public } from '../../iam/guards/auth.guard';
import { IsNotEmpty, IsString } from 'class-validator';

class NaturalLanguageQueryDto {
  @IsString()
  @IsNotEmpty()
  query!: string;
}

@Public()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiFinancialSnapshotService) {}

  /**
   * GET /api/v1/ai/snapshot — Current financial snapshot
   */
  @Get('snapshot')
  getSnapshot() {
    return this.aiService.getSnapshot();
  }

  /**
   * POST /api/v1/ai/query — Natural language financial query
   */
  @Post('query')
  query(@Body() dto: NaturalLanguageQueryDto) {
    return this.aiService.processNaturalLanguageQuery(dto.query);
  }

  /**
   * GET /api/v1/ai/insights — Recent AI-generated insights
   */
  @Get('insights')
  getInsights(@Query('limit') limit?: string) {
    return this.aiService.getInsights(limit ? Number(limit) : 20);
  }

  /**
   * GET /api/v1/ai/event-history — Ingested event history (read-model)
   */
  @Get('event-history')
  getEventHistory() {
    return this.aiService.getEventHistory();
  }
}
