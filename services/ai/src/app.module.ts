import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiEventOrmEntity } from './infrastructure/ai-event.orm-entity';
import { KafkaLedgerConsumer } from './infrastructure/kafka-ledger.consumer';
import { EmbeddingClient } from './rag/embedding.client';
import { RagVectorStore } from './rag/rag-vector-store';
import { ComplianceCorpusSeeder } from './rag/compliance-corpus.seeder';

const host = process.env.AI_DB_HOST || process.env.POSTGRES_HOST;

@Module({
  imports: [
    ...(host ? [
      TypeOrmModule.forRoot({
        name: 'ai', type: 'postgres', host,
        port: parseInt(process.env.AI_DB_PORT || '5432', 10),
        username: process.env.AI_DB_USER || 'guri',
        password: process.env.AI_DB_PASSWORD || 'guri',
        database: process.env.AI_DB_NAME || 'guri_ai',
        entities: [AiEventOrmEntity],
        synchronize: process.env.NODE_ENV !== 'production',
      }),
      TypeOrmModule.forFeature([AiEventOrmEntity], 'ai'),
    ] : []),
  ],
  controllers: [AiController],
  // Provider order matters: RagVectorStore must initialise before ComplianceCorpusSeeder,
  // and both must be ready before AiService.onModuleInit() calls corpusSeeder.seed().
  providers: [EmbeddingClient, RagVectorStore, ComplianceCorpusSeeder, AiService, KafkaLedgerConsumer],
})
export class AppModule {}
