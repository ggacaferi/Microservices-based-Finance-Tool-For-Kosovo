import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiEventOrmEntity } from './infrastructure/ai-event.orm-entity';

const host = process.env.AI_DB_HOST || process.env.POSTGRES_HOST;

@Module({
  imports: [
    ...(host ? [
      TypeOrmModule.forRoot({ type: 'postgres', host, port: parseInt(process.env.AI_DB_PORT || '5432', 10), username: process.env.AI_DB_USER || 'guri', password: process.env.AI_DB_PASSWORD || 'guri', database: process.env.AI_DB_NAME || 'guri_ai', entities: [AiEventOrmEntity], synchronize: process.env.NODE_ENV !== 'production', name: 'ai' }),
      TypeOrmModule.forFeature([AiEventOrmEntity], 'ai'),
    ] : []),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AppModule {}
