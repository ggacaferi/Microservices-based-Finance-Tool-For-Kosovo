import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ledger_journal_entries')
export class JournalEntryOrmEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid', nullable: true }) tenantId!: string;
  @Column() reference!: string;
  @Column({ type: 'date' }) date!: string;
  @Column({ type: 'varchar', length: 20 }) kind!: string;
  @Column({ type: 'decimal', precision: 15, scale: 2 }) amount!: number;
  @Column({ type: 'jsonb' }) lines!: { account: string; debit: number; credit: number }[];
  @Column({ type: 'uuid', nullable: true }) reversedBy?: string;
  @CreateDateColumn() createdAt!: Date;
}
