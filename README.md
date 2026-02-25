# Daily Operations Service

A Domain-Driven Design (DDD) based accounting system for managing daily business operations in compliance with Kosovo Law 06/L-032. The system implements event-driven architecture with separate bounded contexts for Operations, Ledger, and AI financial analysis.

## Features

- **Bills (Accounts Payable)**: Capture supplier bills with tax validation and storno corrections
- **Invoicing (Accounts Receivable)**: Manage customer invoices with full lifecycle tracking
- **Inventory Management**: Track inventory movements with weighted-average valuation
- **Storno Corrections**: Domain-event-driven reversal workflow for accounting corrections
- **Ledger Integration**: Automatic journal entry creation via domain events
- **AI Financial Snapshot**: Real-time expense tracking through event subscriptions
- **Activity Logging**: Complete audit trail of all operations

## Architecture

- **Backend**: NestJS (TypeScript) with DDD aggregates and domain events
- **Frontend**: React + Vite with TypeScript
- **Event Bus**: Custom pub/sub implementation for loose coupling
- **Persistence**: In-memory repositories (demo mode)

## Prerequisites

- Node.js v18+ or v25+
- npm or yarn

## Installation

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

## Running the Application

### Backend Server

```bash
# Development mode (with watch)
npm run start:dev

# Production mode
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

The backend API will be available at: **http://localhost:3000/api/v1**

Health check: http://localhost:3000/api/v1/health

### Frontend Application

```bash
# Development mode
npm --prefix frontend run dev

# Or from the frontend directory
cd frontend
npm run dev
```

The frontend will be available at: **http://localhost:5173**

### Build Frontend for Production

```bash
npm --prefix frontend run build
```

## Testing

### Run All Tests

```bash
npm run test:all
```

### Unit Tests

```bash
# Run once
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:cov
```

### E2E Tests

```bash
npm run test:e2e
```

## API Endpoints

### Bills (Accounts Payable)
- `POST /api/v1/bills` - Create draft bill
- `POST /api/v1/bills/:id/post` - Post bill (validates tax categories)
- `POST /api/v1/bills/:id/reverse` - Reverse bill via storno
- `GET /api/v1/bills/:id` - Get bill by ID
- `GET /api/v1/bills?status=POSTED` - List bills by status

### Invoices (Accounts Receivable)
- `POST /api/v1/invoices` - Create draft invoice
- `POST /api/v1/invoices/:id/send` - Send invoice to customer
- `POST /api/v1/invoices/:id/pay` - Mark invoice as paid
- `POST /api/v1/invoices/:id/reverse` - Reverse invoice
- `GET /api/v1/invoices/:id` - Get invoice by ID

### Inventory
- `POST /api/v1/inventory/movements` - Record receipt or issue
- `POST /api/v1/inventory/movements/:id/reverse` - Reverse movement
- `GET /api/v1/inventory/valuation` - Get weighted-average valuation

### Operations
- `POST /api/v1/operations/storno` - Generic storno endpoint (returns workflow)
- `GET /api/v1/operations/activities` - Get activity log
- `GET /api/v1/operations/financial-snapshot` - Get AI financial snapshot

## Domain Event Workflow

When a bill is posted:
1. **BillService** emits `billPosted` event
2. **LedgerIntegrationService** subscribes and creates journal entry
3. **AiFinancialSnapshotService** subscribes and updates expense totals

When a bill is reversed (storno):
1. **BillService** emits `billReverted` event with original reference
2. **LedgerIntegrationService** creates storno journal entry (swaps debits/credits)
3. **AiFinancialSnapshotService** decreases expenses

The `/operations/storno` endpoint returns complete workflow information including:
- Event payload
- Ledger journal entries (ORIGINAL + STORNO)
- AI financial snapshot

## Tax Categories (Kosovo Law 06/L-032)

Supported tax category IDs:
- `43` - Standard rate
- `31` - Reduced rate
- `28` - Zero rate

## Project Structure

```
src/
├── application/          # Application services and DTOs
│   ├── bills/           # Bill service and DTOs
│   ├── invoices/        # Invoice service
│   ├── inventory/       # Inventory service
│   ├── events/          # Domain event bus
│   ├── ledger/          # Ledger integration service
│   ├── ai/              # AI financial snapshot service
│   └── operations/      # Activity log and operations
├── domain/              # Domain models and aggregates
│   ├── bills/           # FaturaHyrese aggregate
│   └── tax/             # Tax rule service
└── infrastructure/      # Controllers and persistence
    ├── http/            # REST controllers
    └── persistence/     # In-memory repositories

frontend/
├── src/
│   ├── components/      # Shared UI components
│   ├── pages/           # Page components
│   └── styles/          # CSS styles
```

## Development Scripts

```bash
# Lint and format
npm run lint
npm run format

# Build
npm run build

# Start all (requires two terminals)
# Terminal 1:
npm run start:prod

# Terminal 2:
npm --prefix frontend run dev
```

## Test Coverage

Current test coverage: **44%**
- 21 unit tests (Domain events, Bill service, Inventory service)
- 12 e2e tests (API workflows, Storno workflows)

## License

MIT
