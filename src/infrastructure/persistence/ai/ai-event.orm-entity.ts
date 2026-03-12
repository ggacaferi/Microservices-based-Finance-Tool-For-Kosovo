import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * AI Financial Event — pgvector-ready entity
 *
 * Stores ingested domain events in Postgres with an optional
 * embedding column for vector similarity search (RAG queries).
 *
 * In production with pgvector extension enabled:
 *   ALTER TABLE ai_financial_events ADD COLUMN embedding vector(1536);
 *   CREATE INDEX ON ai_financial_events USING ivfflat (embedding vector_cosine_ops);
 *
 * The NL query engine would then:
 *   1. Embed the user's question using OpenAI / Vertex AI
 *   2. SELECT * FROM ai_financial_events ORDER BY embedding <=> $1 LIMIT 10
 *   3. Feed retrieved context + question to LLM for answer
 */
@Entity('ai_financial_events')
export class AiEventOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column()
  reference!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'boolean', default: false })
  isStorno!: boolean;

  /** Human-readable summary for RAG context retrieval */
  @Column({ type: 'text', nullable: true })
  textContent?: string;

  /**
   * Vector embedding column — requires pgvector extension.
   * Stored as float[] in standard Postgres, or vector(1536) with pgvector.
   * Commented out for environments without pgvector:
   *
   *   @Column({ type: 'float', array: true, nullable: true })
   *   embedding?: number[];
   */

  @CreateDateColumn()
  createdAt!: Date;
}
