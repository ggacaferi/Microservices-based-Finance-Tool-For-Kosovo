# Guri Finance

Event-driven accounting platform for Kosovo SMEs, built with DDD-style bounded contexts.

## Current Architecture

### Services

| Service | Port | Responsibility | Data |
|---|---:|---|---|
| `gateway` (nginx) | 3000 | Single entrypoint + routing to backend services | — |
| `frontend` (React/Vite build served by nginx) | 80 | UI | — |
| `iam` | 3001 | JWT auth, users, tenants, audit | Postgres `guri_iam` |
| `compliance` | 3002 | Kosovo VAT/SKA taxonomy + compliance rules | In-memory taxonomy bundle |
| `operations` | 3003 | Bills, invoices, inventory, storno workflows | Postgres `guri_operations` |
| `ledger` | 3004 | Journal entries, trial balance, reports | Postgres `guri_ledger` |
| `ai` | 3005 | Tenant-scoped financial analysis + Gemini integration | Postgres `guri_ai` (pgvector-ready) |

### Event Bus

Kafka is the primary event bus:

- `operations.events` → consumed by `ledger`
- `ledger.events` → consumed by `ai`

Flow:

1. Operations commits business state.
2. Operations publishes to `operations.events`.
3. Ledger consumes and posts journal entries.
4. Ledger publishes to `ledger.events`.
5. AI consumes and updates tenant read model/insights.

## Local Development (Recommended)

### Prerequisites

- Docker + Docker Compose
- Node.js 18+ (optional, for non-container development)

### Start everything

```bash
docker compose up -d --build
```

### Key URLs

- Gateway health: `http://localhost:3000/health`
- API base: `http://localhost:3000/api/v1`
- Frontend: `http://localhost/`

### Local infra started by Compose

- 4 Postgres instances (`iam`, `operations`, `ledger`, `ai`)
- Kafka + Zookeeper
- All app services + gateway + frontend

## AI Service Notes

### Gemini

AI uses Gemini via:

- `GEMINI_API_KEY` (secret)
- `GEMINI_MODEL` (currently `gemini-3-flash-preview`)

For local Compose, secret is loaded from:

- `services/ai/.env`

### Tenant isolation

AI endpoints require tenant context and are tenant-scoped:

- `x-tenant-id` header required on:
  - `GET /api/v1/ai/snapshot`
  - `GET /api/v1/ai/insights`
  - `GET /api/v1/ai/event-history`
  - `POST /api/v1/ai/query`

AI database sampling and reconciliation are filtered per tenant.

## API Overview

### IAM

- `POST /api/v1/iam/register`
- `POST /api/v1/iam/login`
- `GET /api/v1/iam/me`
- `POST /api/v1/iam/users`
- `GET /api/v1/iam/users`
- `GET /api/v1/iam/tenants`
- `GET /api/v1/iam/audit`
- `POST /api/v1/iam/verify`

### Compliance

- `GET /api/v1/compliance/summary`
- `GET /api/v1/compliance/tax-categories`
- `GET /api/v1/compliance/chart-of-accounts`
- `GET /api/v1/compliance/rules`
- `GET /api/v1/compliance/bundle`
- `POST /api/v1/compliance/refresh`

### Operations

- `POST /api/v1/bills`
- `POST /api/v1/bills/:id/post`
- `POST /api/v1/bills/:id/reverse`
- `GET /api/v1/bills/:id`
- `POST /api/v1/invoices`
- `POST /api/v1/invoices/:id/send`
- `POST /api/v1/invoices/:id/pay`
- `POST /api/v1/invoices/:id/reverse`
- `POST /api/v1/inventory/movements`
- `POST /api/v1/inventory/movements/:id/reverse`
- `GET /api/v1/inventory/valuation`
- `POST /api/v1/operations/storno`
- `GET /api/v1/operations/activities`

### Ledger

- `GET /api/v1/ledger/journal-entries`
- `GET /api/v1/ledger/journal-entries/:id`
- `GET /api/v1/ledger/bill/:billId`
- `GET /api/v1/ledger/trial-balance`
- `GET /api/v1/ledger/summary`
- `GET /api/v1/ledger/reports/profit-loss`
- `GET /api/v1/ledger/reports/balance-sheet`

### AI

- `GET /api/v1/ai/snapshot`
- `POST /api/v1/ai/query`
- `GET /api/v1/ai/insights`
- `GET /api/v1/ai/event-history`

## Kubernetes (Updated Manifests)

Kubernetes manifests are in `k8s/` and are aligned to the current split services + Kafka setup.

### What is included

- Namespace: `k8s/namespace.yaml`
- Databases (StatefulSets): `k8s/postgres.yaml`
- Kafka + Zookeeper (StatefulSets): `k8s/pubsub.yaml`
- App deployments/services (gateway + frontend + all backend services): `k8s/deployments.yaml`
- ConfigMaps: `k8s/configmaps.yaml`
- Secrets (DB/JWT/Gemini): `k8s/secrets.yaml`
- Ingress routing: `k8s/ingress.yaml`
- HPAs + network policies: `k8s/hpa-network.yaml`
- Pod disruption budgets: `k8s/pdb.yaml`

### Rollout policy (zero-downtime)

Deployments use rolling strategy with:

- `maxUnavailable: 0`
- `maxSurge: 1`
- `minReadySeconds: 10`

This ensures old pods stay available while new pods become ready.
PDBs protect service availability during node drains/voluntary disruptions.

### Apply order

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/pubsub.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa-network.yaml
kubectl apply -f k8s/pdb.yaml

## Event delivery guarantees

Operations now uses an outbox table (`ops_event_outbox`) for domain events.

- State change is committed in Operations.
- Event is stored in outbox (`PENDING`).
- Background dispatcher retries until published (`PUBLISHED`).

Every event payload includes:

- `eventId`
- `idempotencyKey`
- `occurredAt`

Ledger stores ingested event markers (`ledger_ingested_events`) and skips duplicates by `eventId`/`idempotencyKey`, making replay and retries safe.
```

### Important before production apply

1. Replace image names/tags in `k8s/deployments.yaml` with your real registry tags.
2. Replace placeholder secrets in `k8s/secrets.yaml`.
3. Ensure your ingress class matches your cluster (`ingressClassName` currently `nginx`).

## Tests

```bash
npm test
npm run test:e2e
npm run test:all
npm run test:cov
npm run test:cov:metrics
npm run --prefix frontend test:cov
```

### Coverage reports

- Backend coverage summary: `npm run test:cov`
- Backend coverage metrics: `npm run test:cov:metrics`
- Frontend coverage summary: `npm run --prefix frontend test:cov`

## License

MIT
