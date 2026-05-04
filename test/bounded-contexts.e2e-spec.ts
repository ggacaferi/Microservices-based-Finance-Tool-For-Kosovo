import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Five Bounded Contexts (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── IAM Service ─────────────────────────────────────────

  describe('IAM Service (Identity & Access)', () => {
    let accessToken: string;

    it('POST /iam/register — registers a tenant and returns JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/register')
        .send({
          tenantName: 'Acme Corp',
          email: 'admin@acme.com',
          password: 'secret123',
          fullName: 'Admin User',
        })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.tenantId).toBeDefined();
      accessToken = res.body.accessToken;
    });

    it('POST /iam/register — rejects duplicate tenant', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/iam/register')
        .send({
          tenantName: 'Acme Corp',
          email: 'other@acme.com',
          password: 'secret123',
          fullName: 'Other User',
        })
        .expect(409);
    });

    it('POST /iam/login — authenticates with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/login')
        .send({ email: 'admin@acme.com', password: 'secret123' })
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('admin@acme.com');
    });

    it('POST /iam/login — rejects invalid password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/iam/login')
        .send({ email: 'admin@acme.com', password: 'wrong' })
        .expect(401);
    });

    it('GET /iam/me — returns current user from JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe('admin@acme.com');
      expect(res.body.role).toBe('admin');
    });

    it('GET /iam/me — rejects missing token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/iam/me')
        .expect(401);
    });

    it('POST /iam/users — admin can create users', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          email: 'accountant@acme.com',
          password: 'pass1234',
          fullName: 'Jane Accountant',
          role: 'accountant',
        })
        .expect(201);

      expect(res.body.email).toBe('accountant@acme.com');
      expect(res.body.role).toBe('accountant');
    });

    it('GET /iam/users — lists users in tenant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /iam/audit — returns audit log', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/iam/audit')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].action).toBeDefined();
    });

    it('POST /iam/verify — validates a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/iam/verify')
        .send({ token: accessToken })
        .expect(201);

      expect(res.body.valid).toBe(true);
      expect(res.body.payload.email).toBe('admin@acme.com');
    });
  });

  // ── Compliance Service ──────────────────────────────────

  describe('Compliance Service (Rule Distribution)', () => {
    it('GET /compliance/summary — returns cache status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/summary')
        .expect(200);

      expect(res.body.version).toBeGreaterThanOrEqual(1);
      expect(res.body.taxCategoryCount).toBeGreaterThanOrEqual(3);
      expect(res.body.accountCount).toBeGreaterThanOrEqual(15);
      expect(res.body.ruleCount).toBeGreaterThanOrEqual(4);
    });

    it('GET /compliance/tax-categories — returns Kosovo VAT categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/tax-categories')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(3);
      const standard = res.body.find((t: any) => t.id === '43');
      expect(standard).toBeDefined();
      expect(standard.rate).toBe(0.18);
      expect(standard.legalBasis).toContain('06/L-032');
    });

    it('GET /compliance/chart-of-accounts — returns full SKA', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/chart-of-accounts')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(15);
      const expense = res.body.find((a: any) => a.code === '5000');
      expect(expense).toBeDefined();
      expect(expense.type).toBe('EXPENSE');
    });

    it('GET /compliance/chart-of-accounts?type=ASSET — filters by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/chart-of-accounts?type=ASSET')
        .expect(200);

      expect(res.body.every((a: any) => a.type === 'ASSET')).toBe(true);
    });

    it('GET /compliance/rules — returns compliance rules', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/rules')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(4);
      const stornoRule = res.body.find((r: any) => r.id === 'CR-003');
      expect(stornoRule.context).toBe('bill');
    });

    it('GET /compliance/rules?context=bill — filters by context', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/rules?context=bill')
        .expect(200);

      expect(res.body.every((r: any) => r.context === 'bill')).toBe(true);
    });

    it('GET /compliance/bundle — returns full distribution bundle', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/compliance/bundle')
        .expect(200);

      expect(res.body.version).toBeDefined();
      expect(res.body.taxCategories).toBeDefined();
      expect(res.body.chartOfAccounts).toBeDefined();
      expect(res.body.rules).toBeDefined();
    });

    it('POST /compliance/refresh — refreshes cache and increments version', async () => {
      const before = await request(app.getHttpServer()).get('/api/v1/compliance/summary');

      const res = await request(app.getHttpServer())
        .post('/api/v1/compliance/refresh')
        .expect(201);

      expect(res.body.version).toBe(before.body.version + 1);
    });
  });

  // ── Ledger Service ──────────────────────────────────────

  describe('Ledger Service (Double-Entry Bookkeeping)', () => {
    let billId: string;

    it('GET /ledger/summary — starts empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/summary')
        .expect(200);

      expect(res.body.totalEntries).toBe(0);
      expect(res.body.balanced).toBe(true);
    });

    it('creates journal entries via bill lifecycle', async () => {
      // Create + post a bill to trigger ledger events
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-LEDGER',
          issueDate: '2026-03-12',
          currency: 'EUR',
          lineItems: [{ description: 'Ledger test', quantity: 2, unitPrice: 250, taxCategoryId: '43' }],
        })
        .expect(201);

      billId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/post`)
        .expect(201);
    });

    it('GET /ledger/journal-entries — returns posted entries', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/journal-entries')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].kind).toBe('ORIGINAL');
      expect(res.body[0].amount).toBe(500);
    });

    it('GET /ledger/bill/:billId — returns bill workflow', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ledger/bill/${billId}`)
        .expect(200);

      expect(res.body.originalReference).toBe(`Bill-${billId}`);
      expect(res.body.journalEntries.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /ledger/trial-balance — returns account balances', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/trial-balance')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const expense = res.body.find((a: any) => a.account === 'Expense');
      expect(expense).toBeDefined();
      expect(expense.totalDebit).toBeGreaterThan(0);
    });

    it('GET /ledger/summary — reflects posted entries', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/summary')
        .expect(200);

      expect(res.body.totalEntries).toBeGreaterThanOrEqual(1);
      expect(res.body.originalEntries).toBeGreaterThanOrEqual(1);
      expect(res.body.balanced).toBe(true);
    });

    it('storno creates STORNO journal entry with swapped debits/credits', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/reverse`)
        .send({ reason: 'Ledger test storno' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/v1/ledger/journal-entries?kind=STORNO')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const storno = res.body[0];
      expect(storno.kind).toBe('STORNO');
      // In storno, debits and credits are swapped
      const expenseLine = storno.lines.find((l: any) => l.account === 'Expense');
      expect(expenseLine.credit).toBeGreaterThan(0);
      expect(expenseLine.debit).toBe(0);
    });
  });

  // ── AI Service ──────────────────────────────────────────

  describe('AI Service (Financial Intelligence)', () => {
    it('GET /ai/snapshot — returns financial snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/snapshot')
        .expect(200);

      expect(res.body.totalExpenses).toBeDefined();
      expect(res.body.entryCount).toBeDefined();
      expect(res.body.netExpenses).toBeDefined();
      expect(Array.isArray(res.body.insights)).toBe(true);
    });

    it('POST /ai/query — answers expense question', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/query')
        .send({ query: 'How much have we spent total?' })
        .expect(201);

      expect(res.body.answer).toBeDefined();
      expect(res.body.confidence).toBeGreaterThan(0.5);
      expect(res.body.sources).toBeDefined();
      expect(res.body.answer).toContain('€');
    });

    it('POST /ai/query — answers storno question', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/query')
        .send({ query: 'Are there any financial issues or warnings I should know about?' })
        .expect(201);

      expect(res.body.answer.length).toBeGreaterThan(10);
      expect(res.body.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('POST /ai/query — answers summary question', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/query')
        .send({ query: 'Give me a financial overview' })
        .expect(201);

      expect(res.body.answer).toContain('Financial Overview');
      expect(res.body.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('GET /ai/insights — returns generated insights', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/insights')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /ai/event-history — returns ingested events', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/event-history')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].reference).toBeDefined();
    });
  });

  // ── Cross-Context Integration ───────────────────────────

  describe('Cross-Context Integration (Event Flow)', () => {
    it('full lifecycle: Operations → Ledger → AI', async () => {
      // 1. Create + post a bill (Operations)
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-CROSS',
          issueDate: '2026-03-12',
          currency: 'EUR',
          lineItems: [{ description: 'Cross-context test', quantity: 1, unitPrice: 777, taxCategoryId: '43' }],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/bills/${createRes.body.id}/post`)
        .expect(201);

      // 2. Verify Ledger has the entry
      const ledger = await request(app.getHttpServer())
        .get(`/api/v1/ledger/bill/${createRes.body.id}`)
        .expect(200);

      expect(ledger.body.journalEntries.length).toBe(1);
      expect(ledger.body.journalEntries[0].amount).toBe(777);

      // 3. Verify AI ingested the event
      const snapshot = await request(app.getHttpServer())
        .get('/api/v1/ai/snapshot')
        .expect(200);

      expect(snapshot.body.entryCount).toBeGreaterThanOrEqual(1);

      // 4. Storno reversal
      await request(app.getHttpServer())
        .post(`/api/v1/bills/${createRes.body.id}/reverse`)
        .send({ reason: 'Cross-context test' })
        .expect(201);

      // 5. Verify Ledger storno
      const ledgerAfter = await request(app.getHttpServer())
        .get(`/api/v1/ledger/bill/${createRes.body.id}`)
        .expect(200);

      expect(ledgerAfter.body.journalEntries.length).toBe(2);
      expect(ledgerAfter.body.journalEntries.some((e: any) => e.kind === 'STORNO')).toBe(true);

      // 6. Verify ledger is still balanced
      const summary = await request(app.getHttpServer())
        .get('/api/v1/ledger/summary')
        .expect(200);

      expect(summary.body.balanced).toBe(true);
    });
  });
});
