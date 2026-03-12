import { Module } from '@nestjs/common';
import { HealthController } from './infrastructure/controllers/health.controller';
import { DailyOperationsModule } from './daily-operations.module';
import { IamModule } from './iam/iam.module';
import { ComplianceModule } from './compliance/compliance.module';

/**
 * Root Application Module — Guri Finance
 *
 * Wires together the five bounded contexts:
 * 1. IAM Service        → Postgres (guri_iam) — Auth, RBAC, multi-tenant
 * 2. Compliance Service → In-memory cache     — Kosovo Law 06/L-032 rules
 * 3. Operations Service → Postgres (guri_operations) — Bills, Invoices, Inventory
 * 4. Ledger Service     → Postgres (guri_ledger)     — Double-entry journal entries
 * 5. AI Service         → Postgres + pgvector (guri_ai) — NL queries, embeddings
 *
 * Inter-service communication: Google Cloud Pub/Sub (in-memory fallback for local dev)
 * Orchestration: Kubernetes (GKE) with per-service Deployments
 */
@Module({
  imports: [
    IamModule,
    ComplianceModule,
    DailyOperationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
