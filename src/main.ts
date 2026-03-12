import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

/**
 * ═══════════════════════════════════════════════════════════════════
 * Guri Finance ERP — API Gateway Entry Point
 * ═══════════════════════════════════════════════════════════════════
 *
 * How the user communicates with the application:
 * ──────────────────────────────────────────────
 * ALL client requests (browser, mobile, third-party) enter through this
 * single API Gateway, which enforces:
 *
 *  1. Authentication (JwtAuthGuard)  — verifies Bearer tokens issued by IAM.
 *  2. Authorization  (RolesGuard)    — enforces admin/accountant/auditor/viewer
 *                                      hierarchy per route.
 *  3. Tenant Isolation (TenantGuard) — prevents cross-tenant data leakage.
 *  4. Input Validation (ValidationPipe) — rejects malformed payloads before
 *                                         they touch the domain layer.
 *
 * Request flow:
 *  Client → [HTTPS] → API Gateway (port 3000, /api/v1)
 *           → JwtAuthGuard → RolesGuard → TenantGuard
 *           → Bounded Context Controller
 *           → Application Service → Domain Aggregate / Domain Event
 *
 * Bounded contexts exposed:
 *  POST/GET /api/v1/iam/*          → Identity & Access Management
 *  POST/GET /api/v1/bills/*        → Daily Operations (Accounts Payable)
 *  POST/GET /api/v1/invoices/*     → Daily Operations (Accounts Receivable)
 *  POST/GET /api/v1/inventory/*    → Daily Operations (Inventory)
 *  POST/GET /api/v1/operations/*   → Storno Saga, Activity Log, AI Snapshot
 *  GET      /api/v1/ledger/*       → General Ledger (Journal Entries, Trial Balance)
 *  GET      /api/v1/ai/*           → AI Query Interface (NL queries, insights)
 *  GET      /api/v1/compliance/*   → Compliance Rule Distribution (read-only)
 *  GET      /api/v1/health         → Health check
 * ═══════════════════════════════════════════════════════════════════
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve static files from public directory
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Enable global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for API Gateway integration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Set global prefix
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Daily Operations Service is running on: http://localhost:${port}`);
  console.log(`🌐 Frontend UI: http://localhost:${port}`);
  console.log(`📊 API: http://localhost:${port}/api/v1`);
  console.log(`🏥 Health check: http://localhost:${port}/api/v1/health`);
}

bootstrap();
