# Guri Finance

An Event-Driven, Cloud-Native Microservices platform built strictly on **Domain-Driven Design (DDD)**, designed for SME accounting compliance with **Kosovo Law 06/L-032**.

## Architecture — Five Bounded Contexts

| # | Service | Role | Data Store | Key Responsibilities |
|---|---------|------|-----------|---------------------|
| 1 | **IAM Service** | The Gatekeeper | Postgres (`guri_iam`) | Authentication (JWT), authorization (RBAC), multi-tenant isolation, audit trails |
| 2 | **Compliance Service** | The Rule Distributor | In-Memory Cache | Immutable Kosovo SKA and VAT tax codes. Distributes rules to other services |
| 3 | **Operations Service** | The Workspace | Postgres (`guri_operations`) | Bills (AP), Invoices (AR), Inventory. Validates with Compliance rules, emits domain events |
| 4 | **Ledger Service** | The Financial Truth | Postgres (`guri_ledger`) | Double-entry bookkeeping. Consumes events → creates journal entries with Storno logic |
| 5 | **AI Service** | The Intelligence Layer | Postgres + pgvector (`guri_ai`) | Ingests journal entries into vector store, builds read-model, answers NL financial queries |

### Infrastructure Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Databases** | PostgreSQL 16 (4 instances) | Per-service data isolation, one DB per bounded context |
| **Vector Store** | pgvector on PostgreSQL | Embedding storage for RAG-based AI financial queries |
| **Event Bus** | Google Cloud Pub/Sub | Async inter-service communication (3 topics, 3 subscriptions) |
| **Orchestration** | Kubernetes (GKE) | Container orchestration with HPA, NetworkPolicy, Ingress |
| **Containers** | Docker (multi-stage builds) | Backend (Node.js Alpine) + Frontend (Nginx Alpine) |
| **Ingress** | GKE Ingress + Managed TLS | External routing, SSL termination |

### Communication Flow (Lifecycle of a Bill Reversal)

```
Web Client → GKE Ingress → API Gateway Pod → IAM (JWT Verify) → Operations (Revert Bill)
                                                                       ↓ Pub/Sub: billReverted
                                                                 Ledger (Storno Journal Entry)
                                                                       ↓ Pub/Sub: journalEntryPosted
                                                                 AI Service (pgvector Ingest + Snapshot)
```

1. **Request**: User clicks "Revert Bill"
2. **Auth Check (Sync)**: API Gateway verifies JWT via IAM Service (Postgres lookup)
3. **Action (Sync)**: Operations validates against cached Compliance rules, saves reverted bill to Postgres
4. **Event Publish (Async)**: Operations publishes `billReverted` to Google Cloud Pub/Sub → user gets 200 OK
5. **Ledger Update (Async)**: Ledger subscribes, creates STORNO journal entry in Postgres, publishes `journalEntryPosted`
6. **AI Sync (Async)**: AI Service subscribes, ingests event into pgvector store, updates read-model

### Google Cloud Pub/Sub Topics

| Topic | Publisher | Subscription | Consumer |
|-------|-----------|-------------|----------|
| `guri-finance.operations.bill-posted` | Operations | `guri-finance.ledger.bill-posted-sub` | Ledger |
| `guri-finance.operations.bill-reverted` | Operations | `guri-finance.ledger.bill-reverted-sub` | Ledger |
| `guri-finance.ledger.journal-entry-posted` | Ledger | `guri-finance.ai.journal-entry-posted-sub` | AI |

## Prerequisites

- Node.js v18+
- Docker & Docker Compose (for Postgres + Pub/Sub emulator)
- `kubectl` (for Kubernetes deployment)
- Google Cloud SDK (for GKE deployment)

## Quick Start — Local Development

```bash
# 1. Install dependencies
npm install && cd frontend && npm install && cd ..

# 2. Start infrastructure (4 Postgres DBs + Pub/Sub emulator)
docker compose up -d

# 3. Configure environment
cp .env.example .env

# 4. Start backend (auto-connects to Postgres + Pub/Sub)
npm run start:dev

# 5. Start frontend (separate terminal)
npm --prefix frontend run dev
```

Backend API: **http://localhost:3000/api/v1**  
Frontend: **http://localhost:5173**

### Running Without Docker (in-memory fallback)

All services gracefully fall back to in-memory storage when Postgres/Pub/Sub are unavailable:

```bash
npm install
npm run start:dev          # No env vars needed — runs fully in-memory
```

## Docker

### Build Images

```bash
# Backend
docker build -t guri-api:latest .

# Frontend
docker build -t guri-frontend:latest ./frontend
```

### Local Docker Compose

```bash
# Start all infrastructure (4 Postgres + Pub/Sub emulator)
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

**Containers started by Docker Compose:**

| Container | Image | Port | Database |
|-----------|-------|------|----------|
| `guri-iam-db` | postgres:16-alpine | 5432 | `guri_iam` |
| `guri-ops-db` | postgres:16-alpine | 5433 | `guri_operations` |
| `guri-ledger-db` | postgres:16-alpine | 5434 | `guri_ledger` |
| `guri-ai-db` | pgvector/pgvector:pg16 | 5435 | `guri_ai` |
| `guri-pubsub` | google-cloud-cli:emulators | 8085 | — |

## Kubernetes Deployment (GKE)

### Cluster Setup

```bash
# Create GKE cluster
gcloud container clusters create guri-finance \
  --zone europe-west1-b \
  --num-nodes 3 \
  --machine-type e2-standard-2 \
  --workload-pool=guri-finance-prod.svc.id.goog

# Configure kubectl
gcloud container clusters get-credentials guri-finance --zone europe-west1-b
```

### Deploy

```bash
# Apply manifests in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/pubsub.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa-network.yaml

# Verify
kubectl -n guri-finance get pods
```

### Kubernetes Resources

| Resource | Name | Type | Purpose |
|----------|------|------|---------|
| StatefulSet | `iam-postgres` | Database | IAM user/tenant data |
| StatefulSet | `ops-postgres` | Database | Bills, invoices, inventory |
| StatefulSet | `ledger-postgres` | Database | Journal entries |
| StatefulSet | `ai-postgres` | Database | pgvector financial events |
| Deployment | `api-gateway` | Backend | NestJS API (2 replicas, HPA to 10) |
| Deployment | `frontend` | Frontend | Nginx + React SPA (2 replicas) |
| Ingress | `guri-finance-ingress` | Routing | GKE Ingress with managed TLS |
| HPA | `api-gateway-hpa` | Autoscaling | CPU 70% / Memory 80% thresholds |
| NetworkPolicy | `postgres-access` | Security | Only backend pods can reach databases |
| ServiceAccount | `guri-pubsub-sa` | Auth | Workload Identity for Pub/Sub access |

## Testing

```bash
# All tests (21 unit + 44 e2e = 65 total)
npm run test:all

# Unit tests only
npm test

# E2E tests only
npm run test:e2e

# With coverage
npm run test:cov
```

## API Endpoints

### IAM Service (`/api/v1/iam`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/iam/register` | Public | Register tenant + admin user, receive JWT |
| POST | `/iam/login` | Public | Authenticate, receive JWT |
| GET | `/iam/me` | JWT | Current user info from token |
| POST | `/iam/users` | Admin | Create user within tenant |
| GET | `/iam/users` | Accountant+ | List users in tenant |
| GET | `/iam/tenants` | Admin | List all tenants |
| GET | `/iam/audit` | Admin | View security audit log |
| POST | `/iam/verify` | Public | Validate a JWT token |

### Compliance Service (`/api/v1/compliance`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/compliance/summary` | Cache status (version, counts) |
| GET | `/compliance/tax-categories` | Kosovo VAT categories |
| GET | `/compliance/chart-of-accounts` | Standard Chart of Accounts (SKA) |
| GET | `/compliance/rules` | Compliance rules (optional `?context=bill`) |
| GET | `/compliance/bundle` | Full distribution bundle for other services |
| POST | `/compliance/refresh` | Force cache refresh (simulates law update) |

### Operations Service (`/api/v1/bills`, `/invoices`, `/inventory`, `/operations`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/bills` | Create draft bill |
| POST | `/bills/:id/post` | Post bill (tax validation + domain events) |
| POST | `/bills/:id/reverse` | Reverse bill via storno |
| GET | `/bills/:id` | Get bill by ID |
| POST | `/invoices` | Create draft invoice |
| POST | `/invoices/:id/send` | Send invoice |
| POST | `/invoices/:id/pay` | Mark invoice paid |
| POST | `/invoices/:id/reverse` | Reverse invoice |
| POST | `/inventory/movements` | Record receipt/issue |
| POST | `/inventory/movements/:id/reverse` | Reverse movement |
| GET | `/inventory/valuation` | Weighted-average valuation |
| POST | `/operations/storno` | Unified storno endpoint (returns full workflow) |
| GET | `/operations/activities` | Activity log |
| GET | `/operations/financial-snapshot` | AI financial snapshot |

### Ledger Service (`/api/v1/ledger`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ledger/journal-entries` | All entries (optional `?kind=STORNO`) |
| GET | `/ledger/journal-entries/:id` | Single entry by ID |
| GET | `/ledger/bill/:billId` | All entries for a bill |
| GET | `/ledger/trial-balance` | Account-level debit/credit totals |
| GET | `/ledger/summary` | Statistics (count, balanced status) |

### AI Service (`/api/v1/ai`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ai/snapshot` | Current financial snapshot |
| POST | `/ai/query` | Natural language financial query |
| GET | `/ai/insights` | AI-generated insights |
| GET | `/ai/event-history` | Ingested event read-model |

## Domain Events (via Google Cloud Pub/Sub)

| Event | Pub/Sub Topic | Publisher | Consumer |
|-------|--------------|-----------|----------|
| `billPosted` | `guri-finance.operations.bill-posted` | Operations → Postgres | Ledger → Postgres |
| `billReverted` | `guri-finance.operations.bill-reverted` | Operations → Postgres | Ledger → Postgres |
| `journalEntryPosted` | `guri-finance.ledger.journal-entry-posted` | Ledger → Postgres | AI → pgvector |

## Tax Categories (Kosovo Law 06/L-032)

| ID | Name | Rate | Legal Basis |
|----|------|------|-------------|
| 43 | Standard VAT | 18% | Article 27 |
| 31 | Exempt (Blerjet pa TVSH) | 0% | Article 28 |
| 28 | Reverse Charge (Ngarkesa e Kundërt) | 0% | Article 30 |
| 08 | Reduced Rate | 8% | Article 27(2) |

## Project Structure

```
src/
├── app.module.ts                    # Root module — wires all bounded contexts
├── daily-operations.module.ts       # Operations + Ledger + AI module (TypeORM per-DB)
├── iam/                             # Bounded Context 1: Identity & Access → Postgres (guri_iam)
│   ├── domain/                      #   User, Tenant entities
│   ├── application/                 #   AuthService (async, Postgres-backed)
│   ├── guards/                      #   JWT, Roles, Tenant guards
│   └── infrastructure/              #   Controller, ORM entities, Postgres repos
├── compliance/                      # Bounded Context 2: Compliance Engine → In-Memory Cache
│   ├── domain/                      #   Tax taxonomy, SKA, rules
│   ├── application/                 #   ComplianceService (versioned cache)
│   └── infrastructure/              #   Controller
├── application/                     # Bounded Context 3: Operations → Postgres (guri_operations)
│   ├── bills/                       #   Bill service + DTOs
│   ├── invoices/                    #   Invoice service + DTOs
│   ├── inventory/                   #   Inventory service + DTOs
│   ├── events/                      #   Google Cloud Pub/Sub event bus (with in-memory fallback)
│   ├── ledger/                      #   Bounded Context 4: Ledger → Postgres (guri_ledger)
│   ├── ai/                          #   Bounded Context 5: AI → pgvector (guri_ai)
│   └── operations/                  #   Activity log
├── domain/                          # Domain layer
│   ├── bills/                       #   FaturaHyrese aggregate
│   └── tax/                         #   TaxRuleService
└── infrastructure/
    ├── controllers/                 #   Health check
    ├── database/                    #   Per-service Postgres configs (IAM, Ops, Ledger, AI)
    ├── http/                        #   All REST controllers
    └── persistence/
        ├── bills/                   #   BillOrmEntity + Postgres repo
        ├── ledger/                  #   JournalEntryOrmEntity + Postgres repo
        └── ai/                      #   AiEventOrmEntity (pgvector-ready)

frontend/
├── Dockerfile                       # Multi-stage: build → nginx:alpine
└── src/
    ├── pages/
    │   ├── IamPage.tsx              #   Register, login, RBAC, audit
    │   ├── CompliancePage.tsx       #   Tax categories, SKA, rules
    │   ├── DailyOpsPage.tsx         #   Bills, invoices, inventory, storno
    │   ├── LedgerPage.tsx           #   Journal entries, trial balance
    │   └── AiPage.tsx              #   NL queries, snapshot, insights
    └── components/
        └── Layout.tsx               #   App shell with sidebar navigation

k8s/
├── namespace.yaml                   # guri-finance namespace
├── secrets.yaml                     # DB passwords, JWT secret
├── configmaps.yaml                  # Per-service DB host/port/name configs
├── pubsub.yaml                      # Workload Identity ServiceAccount for Pub/Sub
├── postgres.yaml                    # 4 StatefulSets (IAM, Ops, Ledger, AI/pgvector)
├── deployments.yaml                 # API gateway (2 replicas) + Frontend (2 replicas)
├── ingress.yaml                     # GKE Ingress + Managed TLS
└── hpa-network.yaml                 # HPA autoscaling + NetworkPolicy for DB isolation

test/
├── bill.service.spec.ts             # Unit: Bill lifecycle
├── domain-events.spec.ts            # Unit: Event bus, Ledger, AI
├── inventory.service.spec.ts        # Unit: Weighted-average costing
├── app.e2e-spec.ts                  # E2E: Full AP/AR/Inventory lifecycles
├── storno-workflow.e2e-spec.ts      # E2E: Storno + domain event flows
└── bounded-contexts.e2e-spec.ts     # E2E: All 5 contexts + cross-context
```

## Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `IAM_DB_HOST` | — | Postgres host for IAM service |
| `OPS_DB_HOST` | — | Postgres host for Operations service |
| `LEDGER_DB_HOST` | — | Postgres host for Ledger service |
| `AI_DB_HOST` | — | Postgres+pgvector host for AI service |
| `PUBSUB_ENABLED` | `false` | Enable Google Cloud Pub/Sub |
| `GOOGLE_CLOUD_PROJECT` | — | GCP project ID for Pub/Sub |
| `PUBSUB_EMULATOR_HOST` | — | Local emulator endpoint (e.g., `localhost:8085`) |
| `JWT_SECRET` | hardcoded | Secret for HMAC-SHA256 JWT signing |

When none of the `*_DB_HOST` variables are set, all services run with **in-memory storage** — no Docker or Postgres required.

## License

MIT
