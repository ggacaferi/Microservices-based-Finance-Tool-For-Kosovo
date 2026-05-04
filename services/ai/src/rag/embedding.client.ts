import { Injectable, Logger } from '@nestjs/common';

export const EMBED_MODEL = 'text-embedding-004';
export const EMBED_DIM   = 768;

@Injectable()
export class EmbeddingClient {
  private readonly logger  = new Logger(EmbeddingClient.name);
  private readonly apiKey  = process.env.GEMINI_API_KEY || '';
  private readonly endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;

  readonly dim = EMBED_DIM;

  /**
   * Embed a single text.
   * taskType RETRIEVAL_DOCUMENT → indexing; RETRIEVAL_QUERY → query time.
   * Returns a zero vector when no API key is configured (test / local dev without key).
   */
  async embed(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT',
  ): Promise<number[]> {
    if (!this.apiKey) {
      this.logger.debug('EmbeddingClient: no GEMINI_API_KEY — returning zero vector');
      return new Array(EMBED_DIM).fill(0);
    }

    const res = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini embed HTTP ${res.status}: ${body}`);
    }

    const json: any = await res.json();
    const values: number[] | undefined = json?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBED_DIM) {
      throw new Error(
        `Unexpected embedding shape: length=${values?.length ?? 'undefined'}, expected ${EMBED_DIM}`,
      );
    }
    return values;
  }

  /**
   * Embed multiple texts sequentially.
   * Gemini's public embedding API has no batch endpoint; sequential calls are necessary.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text, 'RETRIEVAL_DOCUMENT'));
    }
    return results;
  }
}
