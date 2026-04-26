import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { JournalEntryOrmEntity } from './infrastructure/journal-entry.orm-entity';
import { LedgerIngestedEventOrmEntity } from './infrastructure/ledger-ingested-event.orm-entity';
import { KafkaOperationsConsumer } from './infrastructure/kafka-operations.consumer';

const host = process.env.LEDGER_DB_HOST || process.env.POSTGRES_HOST;

@Module({
  imports: [
    ...(host ? [
      TypeOrmModule.forRoot({ type: 'postgres', host, port: parseInt(process.env.LEDGER_DB_PORT || '5432', 10), username: process.env.LEDGER_DB_USER || 'guri', password: process.env.LEDGER_DB_PASSWORD || 'guri', database: process.env.LEDGER_DB_NAME || 'guri_ledger', entities: [JournalEntryOrmEntity, LedgerIngestedEventOrmEntity], synchronize: process.env.NODE_ENV !== 'production', name: 'ledger' }),
      TypeOrmModule.forFeature([JournalEntryOrmEntity, LedgerIngestedEventOrmEntity], 'ledger'),
    ] : []),
  ],
  controllers: [LedgerController],
  providers: [LedgerService, KafkaOperationsConsumer],
})
export class AppModule {}
