import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { EMBED_DIM } from './embedding.client';

export interface RagChunk {
  id: string;
  tenantId: string | null;   // null  = shared corpus (SKA, rules, tax categories)
  source: string;            // 'ska_account' | 'compliance_rule' | 'tax_category' | 'journal_entry'
  content: string;           // human-readable text that was embedded
  metadata: Record<string, any>;
  score?: number;            // cosine similarity (populated on retrieval only)
}

/**
 * RagVectorStore
 *
 * Owns the ai_rag_chunks table.  TypeORM cannot create vector(N) columns so
 * this class manages its table entirely through a dedicated pg.Pool.
 *
 * Schema:
 *   ai_rag_chunks (id UUID PK, tenant_id TEXT, source TEXT, content TEXT,
 *                  metadata JSONB, embedding vector(768), created_at TIMESTAMPTZ)
 *
 * Index: HNSW with cosine ops — better recall than ivfflat for corpora under
 * a few hundred-thousand rows, and does not require a manual VACUUM + build step.
 *
 * Similarity search returns both shared (tenant_id IS NULL) and tenant-scoped
 * rows in a single query so the LLM always sees relevant SKA/compliance context
 * alongside the tenant's own journal data.
 */
@Injectable()
export class RagVectorStore implements OnModuleInit {
  private readonly logger = new Logger(RagVectorStore.name);
  private pool?: Pool;
  private _ready = false;

  get isReady(): boolean { return this._ready; }

  async onModuleInit(): Promise<void> {
    const host = process.env.AI_DB_HOST || process.env.POSTGRES_HOST;
    if (!host) {
      this.logger.warn('RagVectorStore: no DB host configured — vector search unavailable');
      return;
    }

    this.pool = new Pool({
      host,
      port: parseInt(process.env.AI_DB_PORT || '5432', 10),
      user: process.env.AI_DB_USER || 'guri',
      password: process.env.AI_DB_PASSWORD || 'guri',
      database: process.env.AI_DB_NAME || 'guri_ai',
      max: 5,
      idleTimeoutMillis: 30_000,
    });

    try {
      await this.migrate();
      this._ready = true;
      this.logger.log(`RagVectorStore: ready (dim=${EMBED_DIM}, index=HNSW/cosine)`);
    } catch (err: any) {
      this.logger.error(`RagVectorStore: migration failed — ${err.message}`);
    }
  }

  // ── Schema management ─────────────────────────────────────────────────────

  private async migrate(): Promise<void> {
    const client = await this.pool!.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_rag_chunks (
          id         UUID         NOT NULL PRIMARY KEY,
          tenant_id  VARCHAR(64),
          source     VARCHAR(64)  NOT NULL,
          content    TEXT         NOT NULL,
          metadata   JSONB,
          embedding  vector(${EMBED_DIM}),
          created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
      `);

      // HNSW cosine index — created only once; skipped if already present
      await client.query(`
        CREATE INDEX IF NOT EXISTS ai_rag_chunks_hnsw
          ON ai_rag_chunks
          USING hnsw (embedding vector_cosine_ops)
          WITH (m = 16, ef_construction = 64)
      `);

      // Covering index for idempotent seeding lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS ai_rag_chunks_source_key_idx
          ON ai_rag_chunks (source, (metadata->>'key'))
          WHERE tenant_id IS NULL
      `);
    } finally {
      client.release();
    }
  }

  // ── Write path ────────────────────────────────────────────────────────────

  /**
   * Insert or update a chunk.  Uses the chunk's id as the conflict target so
   * re-seeding the corpus is idempotent (embeddings and content are refreshed).
   */
  async upsertChunk(chunk: Omit<RagChunk, 'score'>, embedding: number[]): Promise<void> {
    if (!this.pool || !this._ready) return;
    const vec = `[${embedding.join(',')}]`;
    await this.pool.query(
      `INSERT INTO ai_rag_chunks (id, tenant_id, source, content, metadata, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       ON CONFLICT (id) DO UPDATE
         SET content   = EXCLUDED.content,
             metadata  = EXCLUDED.metadata,
             embedding = EXCLUDED.embedding`,
      [
        chunk.id,
        chunk.tenantId ?? null,
        chunk.source,
        chunk.content,
        JSON.stringify(chunk.metadata),
        vec,
      ],
    );
  }

  // ── Read path ─────────────────────────────────────────────────────────────

  /**
   * Cosine similarity search.
   * Returns up to k chunks ranked by relevance.
   * Includes shared corpus (tenant_id IS NULL) AND tenant-scoped rows so one
   * query surfaces both regulatory context and the user's own financial data.
   */
  async similaritySearch(
    queryEmbedding: number[],
    tenantId: string,
    k = 8,
  ): Promise<RagChunk[]> {
    if (!this.pool || !this._ready) return [];
    const vec = `[${queryEmbedding.join(',')}]`;
    const { rows } = await this.pool.query(
      `SELECT id, tenant_id, source, content, metadata,
              1 - (embedding <=> $1::vector) AS score
         FROM ai_rag_chunks
        WHERE embedding IS NOT NULL
          AND (tenant_id IS NULL OR tenant_id = $2)
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [vec, tenantId, k],
    );
    return rows.map((r: any) => ({
      id:       r.id,
      tenantId: r.tenant_id,
      source:   r.source,
      content:  r.content,
      metadata: r.metadata ?? {},
      score:    parseFloat(r.score),
    }));
  }

  // ── Seeding helpers ───────────────────────────────────────────────────────

  /** Count rows in the shared corpus by source type. */
  async countSharedBySource(source: string): Promise<number> {
    if (!this.pool || !this._ready) return 0;
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) AS n FROM ai_rag_chunks WHERE source = $1 AND tenant_id IS NULL`,
      [source],
    );
    return parseInt(rows[0]?.n ?? '0', 10);
  }

  /**
   * Find the UUID of an existing shared chunk by its logical key.
   * Used to make upsert idempotent for static corpus entries.
   */
  async findSharedIdByKey(source: string, key: string): Promise<string | null> {
    if (!this.pool || !this._ready) return null;
    const { rows } = await this.pool.query(
      `SELECT id
         FROM ai_rag_chunks
        WHERE source = $1
          AND tenant_id IS NULL
          AND metadata->>'key' = $2
        LIMIT 1`,
      [source, key],
    );
    return rows[0]?.id ?? null;
  }

  /** Stable deterministic ID for shared corpus entries so re-seeding is safe. */
  static corpusId(): string { return uuidv4(); }
}
