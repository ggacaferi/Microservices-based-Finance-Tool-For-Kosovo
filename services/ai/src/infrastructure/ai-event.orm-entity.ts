import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * AI Financial Event — pgvector-ready entity.
 *
 * In production with pgvector:
 *   ALTER TABLE ai_financial_events ADD COLUMN embedding vector(1536);
 *   CREATE INDEX ON ai_financial_events USING ivfflat (embedding vector_cosine_ops);
 */
@Entity('ai_financial_events')
export class AiEventOrmEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ default: 'public' }) tenantId!: string;
  @Column() reference!: string;
  @Column({ type: 'decimal', precision: 15, scale: 2 }) amount!: number;
  @Column({ type: 'date' }) date!: string;
  @Column({ type: 'boolean', default: false }) isStorno!: boolean;
  @Column({ type: 'text', nullable: true }) textContent?: string;
  @CreateDateColumn() createdAt!: Date;
}
