import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppModule HTTP integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/compliance routes', async () => {
    const summary = await request(app.getHttpServer()).get(
      '/api/v1/compliance/summary',
    );
    expect(summary.status).toBe(200);
    expect(summary.body.version).toBeGreaterThan(0);

    const cats = await request(app.getHttpServer()).get(
      '/api/v1/compliance/tax-categories',
    );
    expect(cats.status).toBe(200);
    expect(Array.isArray(cats.body)).toBe(true);

    const coa = await request(app.getHttpServer()).get(
      '/api/v1/compliance/chart-of-accounts',
    );
    expect(coa.status).toBe(200);

    const coaAsset = await request(app.getHttpServer()).get(
      '/api/v1/compliance/chart-of-accounts?type=asset',
    );
    expect(coaAsset.status).toBe(200);

    const rules = await request(app.getHttpServer()).get(
      '/api/v1/compliance/rules?context=bill',
    );
    expect(rules.status).toBe(200);

    const bundle = await request(app.getHttpServer()).get(
      '/api/v1/compliance/bundle',
    );
    expect(bundle.status).toBe(200);

    const refresh = await request(app.getHttpServer()).post(
      '/api/v1/compliance/refresh',
    );
    expect(refresh.status).toBe(201);
  });

  it('GET /api/v1/ledger and /api/v1/ai endpoints', async () => {
    const tb = await request(app.getHttpServer()).get('/api/v1/ledger/trial-balance');
    expect(tb.status).toBe(200);

    const sum = await request(app.getHttpServer()).get('/api/v1/ledger/summary');
    expect(sum.status).toBe(200);

    const entries = await request(app.getHttpServer()).get(
      '/api/v1/ledger/journal-entries?kind=ORIGINAL',
    );
    expect(entries.status).toBe(200);

    const missing = await request(app.getHttpServer()).get(
      '/api/v1/ledger/journal-entries/does-not-exist',
    );
    expect(missing.status).toBe(200);
    expect(missing.body.error).toMatch(/not found/);

    const snap = await request(app.getHttpServer()).get('/api/v1/ai/snapshot');
    expect(snap.status).toBe(200);

    const nl = await request(app.getHttpServer())
      .post('/api/v1/ai/query')
      .send({ query: 'What is our total expense this month?' });
    expect(nl.status).toBe(201);

    const nl2 = await request(app.getHttpServer())
      .post('/api/v1/ai/query')
      .send({ query: 'Give me a financial summary overview' });
    expect(nl2.status).toBe(201);

    const insights = await request(app.getHttpServer()).get(
      '/api/v1/ai/insights?limit=5',
    );
    expect(insights.status).toBe(200);

    const hist = await request(app.getHttpServer()).get('/api/v1/ai/event-history');
    expect(hist.status).toBe(200);
  });

  it('bills + operations + inventory HTTP surface', async () => {
    const create = await request(app.getHttpServer()).post('/api/v1/bills').send({
      supplierId: 'SUP-HTTP-1',
      issueDate: '2026-02-17',
      dueDate: '2026-03-01',
      currency: 'EUR',
      lineItems: [
        {
          description: 'Paper',
          quantity: 5,
          unitPrice: 4,
          taxCategoryId: '31',
        },
      ],
    });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const listed = await request(app.getHttpServer()).get('/api/v1/bills');
    expect(listed.status).toBe(200);

    const post = await request(app.getHttpServer()).post(
      `/api/v1/bills/${id}/post`,
    );
    expect(post.status).toBe(201);

    const wf = await request(app.getHttpServer()).get(
      `/api/v1/ledger/bill/${id}`,
    );
    expect(wf.status).toBe(200);

    const storno = await request(app.getHttpServer())
      .post('/api/v1/operations/storno')
      .send({ entityType: 'bill', entityId: id, reason: 'HTTP integration' });
    expect(storno.status).toBe(201);

    const inv = await request(app.getHttpServer()).post('/api/v1/invoices').send({
      customerId: 'C-HTTP',
      issueDate: '2026-02-17',
      currency: 'EUR',
      lines: [{ description: 'Svc', quantity: 1, unitPrice: 50 }],
    });
    expect(inv.status).toBe(201);
    const invId = inv.body.id;

    await request(app.getHttpServer()).post(`/api/v1/invoices/${invId}/send`);
    await request(app.getHttpServer()).post(`/api/v1/invoices/${invId}/pay`);

    const invStorno = await request(app.getHttpServer())
      .post('/api/v1/operations/storno')
      .send({ entityType: 'invoice', entityId: invId, reason: 'rollback' });
    expect(invStorno.status).toBe(201);

    const mov = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements')
      .send({
        sku: 'SKU-HTTP',
        description: 'Cable',
        type: 'RECEIPT',
        quantity: 2,
        unitCost: 9,
      });
    expect(mov.status).toBe(201);

    const invStorno2 = await request(app.getHttpServer())
      .post('/api/v1/operations/storno')
      .send({
        entityType: 'inventory',
        entityId: mov.body.id,
        reason: 'undo receipt',
      });
    expect(invStorno2.status).toBe(201);

    const acts = await request(app.getHttpServer()).get(
      '/api/v1/operations/activities?limit=3',
    );
    expect(acts.status).toBe(200);

    await request(app.getHttpServer()).post('/api/v1/operations/activities').send({
      type: 'MANUAL_NOTE',
      entityId: 'note-1',
      summary: 'integration test note',
    });

    const fin = await request(app.getHttpServer()).get(
      '/api/v1/operations/financial-snapshot',
    );
    expect(fin.status).toBe(200);
  });

  it('IAM register, login, guards, and admin flows', async () => {
    const tenant = `Tenant-${Date.now()}`;
    const reg = await request(app.getHttpServer()).post('/api/v1/iam/register').send({
      tenantName: tenant,
      email: `admin-${Date.now()}@example.com`,
      password: 'secret12',
      fullName: 'Admin User',
    });
    expect(reg.status).toBe(201);
    const adminToken = reg.body.accessToken as string;

    const dup = await request(app.getHttpServer()).post('/api/v1/iam/register').send({
      tenantName: tenant,
      email: `other-${Date.now()}@example.com`,
      password: 'secret12',
      fullName: 'X',
    });
    expect(dup.status).toBe(409);

    const badLogin = await request(app.getHttpServer()).post('/api/v1/iam/login').send({
      email: reg.body.user.email,
      password: 'wrong-password',
    });
    expect(badLogin.status).toBe(401);

    const login = await request(app.getHttpServer()).post('/api/v1/iam/login').send({
      email: reg.body.user.email,
      password: 'secret12',
    });
    expect(login.status).toBe(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/iam/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(me.status).toBe(200);

    const noAuthUsers = await request(app.getHttpServer()).get('/api/v1/iam/users');
    expect(noAuthUsers.status).toBe(401);

    const cu = await request(app.getHttpServer())
      .post('/api/v1/iam/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `acct-${Date.now()}@example.com`,
        password: 'secret12',
        fullName: 'Accountant',
        role: 'accountant',
      });
    expect(cu.status).toBe(201);

    const acctLogin = await request(app.getHttpServer()).post('/api/v1/iam/login').send({
      email: cu.body.email,
      password: 'secret12',
    });
    const acctToken = acctLogin.body.accessToken as string;

    const users = await request(app.getHttpServer())
      .get('/api/v1/iam/users')
      .set('Authorization', `Bearer ${acctToken}`);
    expect(users.status).toBe(200);

    const tenants = await request(app.getHttpServer())
      .get('/api/v1/iam/tenants')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(tenants.status).toBe(200);

    const audit = await request(app.getHttpServer())
      .get('/api/v1/iam/audit?limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(audit.status).toBe(200);

    const verify = await request(app.getHttpServer())
      .post('/api/v1/iam/verify')
      .send({ token: adminToken });
    expect(verify.status).toBe(201);
    expect(verify.body.valid).toBe(true);
  });
});
