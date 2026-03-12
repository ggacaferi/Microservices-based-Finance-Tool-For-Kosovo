import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BillOrmEntity } from '../persistence/bills/bill.orm-entity';
import { JournalEntryOrmEntity } from '../persistence/ledger/journal-entry.orm-entity';
import { AiEventOrmEntity } from '../persistence/ai/ai-event.orm-entity';
import { UserOrmEntity } from '../../iam/infrastructure/user.orm-entity';
import { TenantOrmEntity } from '../../iam/infrastructure/tenant.orm-entity';

/**
 * Database Configuration — Per-Service Postgres Connections
 *
 * Each bounded context connects to its own Postgres database
 * (or schema) for data isolation. In Kubernetes, each service
 * has its own DATABASE_*_HOST env var pointing to its Cloud SQL
 * or in-cluster Postgres instance.
 *
 * When env vars are not set, the app runs without DB (in-memory fallback).
 */

// ── IAM Service Database (iam-db) ────────────────────────

export function getIamDatabaseConfig(): TypeOrmModuleOptions | null {
  const host = process.env.IAM_DB_HOST || process.env.POSTGRES_HOST;
  if (!host) return null;

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.IAM_DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.IAM_DB_USER || process.env.POSTGRES_USER || 'guri',
    password: process.env.IAM_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'guri',
    database: process.env.IAM_DB_NAME || 'guri_iam',
    entities: [UserOrmEntity, TenantOrmEntity],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.DB_LOGGING === 'true',
  };
}

// ── Operations Service Database (ops-db) ─────────────────

export function getOperationsDatabaseConfig(): TypeOrmModuleOptions | null {
  const host = process.env.OPS_DB_HOST || process.env.POSTGRES_HOST;
  if (!host) return null;

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.OPS_DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.OPS_DB_USER || process.env.POSTGRES_USER || 'guri',
    password: process.env.OPS_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'guri',
    database: process.env.OPS_DB_NAME || 'guri_operations',
    entities: [BillOrmEntity],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.DB_LOGGING === 'true',
  };
}

// ── Ledger Service Database (ledger-db) ──────────────────

export function getLedgerDatabaseConfig(): TypeOrmModuleOptions | null {
  const host = process.env.LEDGER_DB_HOST || process.env.POSTGRES_HOST;
  if (!host) return null;

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.LEDGER_DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.LEDGER_DB_USER || process.env.POSTGRES_USER || 'guri',
    password: process.env.LEDGER_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'guri',
    database: process.env.LEDGER_DB_NAME || 'guri_ledger',
    entities: [JournalEntryOrmEntity],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.DB_LOGGING === 'true',
  };
}

// ── AI Service Database (ai-db, with pgvector) ───────────

export function getAiDatabaseConfig(): TypeOrmModuleOptions | null {
  const host = process.env.AI_DB_HOST || process.env.POSTGRES_HOST;
  if (!host) return null;

  return {
    type: 'postgres',
    host,
    port: parseInt(process.env.AI_DB_PORT || process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.AI_DB_USER || process.env.POSTGRES_USER || 'guri',
    password: process.env.AI_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'guri',
    database: process.env.AI_DB_NAME || 'guri_ai',
    entities: [AiEventOrmEntity],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.DB_LOGGING === 'true',
    // For pgvector: install extension via migration:
    // CREATE EXTENSION IF NOT EXISTS vector;
  };
}
