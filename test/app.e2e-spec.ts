import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Daily Operations API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns service status', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('validates bill payload and rejects missing required fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .send({ currency: 'EUR', lineItems: [] });

    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('handles full Accounts Payable bill lifecycle with storno', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .send({
        supplierId: 'SUP-E2E-1',
        issueDate: '2026-02-17',
        currency: 'EUR',
        lineItems: [
          {
            description: 'Software subscription',
            quantity: 2,
            unitPrice: 40,
            taxCategoryId: '43'
          }
        ]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('DRAFT');
    expect(createRes.body.totalNetAmount).toBe(80);

    const id = createRes.body.id;

    const postRes = await request(app.getHttpServer()).post(
      `/api/v1/bills/${id}/post`
    );
    expect(postRes.status).toBe(201);
    expect(postRes.body.status).toBe('POSTED');

    const reverseRes = await request(app.getHttpServer())
      .post('/api/v1/operations/storno')
      .send({
        entityType: 'bill',
        entityId: id,
        reason: 'Duplicate entry'
      });
    expect(reverseRes.status).toBe(201);
    expect(reverseRes.body.status).toBe('REVERTED');
    expect(reverseRes.body.workflow.event.payload.OriginalReference).toBe(`Bill-${id}`);
    expect(
      reverseRes.body.workflow.ledger.journalEntries.some((entry: any) => entry.kind === 'STORNO')
    ).toBe(true);
    expect(reverseRes.body.workflow.aiSnapshot.totalExpenses).toBe(0);

    const listRes = await request(app.getHttpServer()).get(
      '/api/v1/bills?status=REVERTED'
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((x: any) => x.id === id)).toBe(true);
  });

  it('handles full Accounts Receivable invoice lifecycle with storno', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/invoices')
      .send({
        customerId: 'CUST-E2E-1',
        issueDate: '2026-02-17',
        currency: 'EUR',
        lines: [
          {
            description: 'Web design',
            quantity: 1,
            unitPrice: 1000
          }
        ]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('DRAFT');
    expect(createRes.body.totalNetAmount).toBe(1000);

    const id = createRes.body.id;

    const sendRes = await request(app.getHttpServer()).post(
      `/api/v1/invoices/${id}/send`
    );
    expect(sendRes.status).toBe(201);
    expect(sendRes.body.status).toBe('SENT');

    const payRes = await request(app.getHttpServer()).post(
      `/api/v1/invoices/${id}/pay`
    );
    expect(payRes.status).toBe(201);
    expect(payRes.body.status).toBe('PAID');

    const reverseRes = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${id}/reverse`)
      .send({ reason: 'Wrong customer' });
    expect(reverseRes.status).toBe(201);
    expect(reverseRes.body.status).toBe('REVERTED');
  });

  it('tracks inventory valuation and supports storno reversal', async () => {
    const receiptRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements')
      .send({
        sku: 'SKU-E2E-1',
        description: 'HDMI Cable',
        type: 'RECEIPT',
        quantity: 10,
        unitCost: 5
      });

    expect(receiptRes.status).toBe(201);

    const issueRes = await request(app.getHttpServer())
      .post('/api/v1/inventory/movements')
      .send({
        sku: 'SKU-E2E-1',
        description: 'HDMI Cable',
        type: 'ISSUE',
        quantity: 4
      });

    expect(issueRes.status).toBe(201);

    const valuationRes = await request(app.getHttpServer()).get(
      '/api/v1/inventory/valuation'
    );
    expect(valuationRes.status).toBe(200);
    const item = valuationRes.body.items.find((x: any) => x.sku === 'SKU-E2E-1');
    expect(item.quantityOnHand).toBe(6);

    const stornoRes = await request(app.getHttpServer())
      .post(`/api/v1/inventory/movements/${issueRes.body.id}/reverse`)
      .send({ reason: 'Issued by mistake' });
    expect(stornoRes.status).toBe(201);

    const valuationAfterStorno = await request(app.getHttpServer()).get(
      '/api/v1/inventory/valuation'
    );
    const itemAfter = valuationAfterStorno.body.items.find(
      (x: any) => x.sku === 'SKU-E2E-1'
    );
    expect(itemAfter.quantityOnHand).toBe(10);
  });

  it('logs activities and supports generic operations storno endpoint', async () => {
    const createBillRes = await request(app.getHttpServer())
      .post('/api/v1/bills')
      .send({
        supplierId: 'SUP-E2E-STORNO',
        issueDate: '2026-02-17',
        currency: 'EUR',
        lineItems: [
          {
            description: 'Stationery',
            quantity: 3,
            unitPrice: 10,
            taxCategoryId: '43'
          }
        ]
      });

    const billId = createBillRes.body.id;
    await request(app.getHttpServer()).post(`/api/v1/bills/${billId}/post`);

    const stornoRes = await request(app.getHttpServer())
      .post('/api/v1/operations/storno')
      .send({
        entityType: 'bill',
        entityId: billId,
        reason: 'Generic storno API test'
      });

    expect(stornoRes.status).toBe(201);
    expect(stornoRes.body.status).toBe('REVERTED');

    const activityRes = await request(app.getHttpServer()).get(
      '/api/v1/operations/activities?limit=10'
    );

    expect(activityRes.status).toBe(200);
    expect(Array.isArray(activityRes.body)).toBe(true);
    expect(activityRes.body.length).toBeGreaterThan(0);
  });
});
