import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Storno Workflow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Bill Storno with Domain Events', () => {
    it('should create, post, and storno a bill with complete workflow', async () => {
      // Create bill
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-WORKFLOW-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lineItems: [
            {
              description: 'Test Product',
              quantity: 5,
              unitPrice: 20,
              taxCategoryId: '43'
            }
          ]
        })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.status).toBe('DRAFT');
      expect(createRes.body.totalNetAmount).toBe(100);
      expect(createRes.body.lines).toHaveLength(1);

      const billId = createRes.body.id;

      // Post bill
      const postRes = await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/post`)
        .expect(201);

      expect(postRes.body.status).toBe('POSTED');

      // Apply storno via operations endpoint
      const stornoRes = await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'Workflow test storno'
        })
        .expect(201);

      // Verify response structure
      expect(stornoRes.body.id).toBe(billId);
      expect(stornoRes.body.status).toBe('REVERTED');
      expect(stornoRes.body.totalNetAmount).toBe(100);
      expect(stornoRes.body.lines).toHaveLength(1);
      
      // Verify workflow object
      expect(stornoRes.body.workflow).toBeDefined();
      expect(stornoRes.body.workflow.event).toBeDefined();
      expect(stornoRes.body.workflow.event.payload).toBeDefined();
      expect(stornoRes.body.workflow.event.payload.OriginalReference).toBe(`Bill-${billId}`);
      expect(stornoRes.body.workflow.event.payload.Reason).toBe('Workflow test storno');

      // Verify ledger integration
      expect(stornoRes.body.workflow.ledger).toBeDefined();
      expect(stornoRes.body.workflow.ledger.journalEntries).toBeDefined();
      expect(Array.isArray(stornoRes.body.workflow.ledger.journalEntries)).toBe(true);

      // Verify AI snapshot
      expect(stornoRes.body.workflow.aiSnapshot).toBeDefined();
      expect(stornoRes.body.workflow.aiSnapshot.totalExpenses).toBeDefined();
      expect(typeof stornoRes.body.workflow.aiSnapshot.totalExpenses).toBe('number');
    });

    it('should not allow storno on draft bills', async () => {
      // Create bill but don't post
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-DRAFT-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lineItems: [
            {
              description: 'Draft Item',
              quantity: 1,
              unitPrice: 50,
              taxCategoryId: '43'
            }
          ]
        })
        .expect(201);

      const billId = createRes.body.id;

      // Try to storno draft bill - should fail
      await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'Should fail'
        })
        .expect(400); // Bad Request for invalid state
    });

    it('should not allow double storno', async () => {
      // Create and post bill
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-DOUBLE-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lineItems: [
            {
              description: 'Double storno test',
              quantity: 1,
              unitPrice: 100,
              taxCategoryId: '31'
            }
          ]
        })
        .expect(201);

      const billId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/post`)
        .expect(201);

      // First storno - should succeed
      await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'First storno'
        })
        .expect(201);

      // Second storno - should fail
      await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'Second storno attempt'
        })
        .expect(400);
    });
  });

  describe('Invoice Storno', () => {
    it('should create, send, and storno an invoice', async () => {
      // Create invoice
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/invoices')
        .send({
          customerId: 'CUS-INV-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lines: [
            {
              description: 'Service rendered',
              quantity: 3,
              unitPrice: 75
            }
          ]
        })
        .expect(201);

      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.status).toBe('DRAFT');

      const invoiceId = createRes.body.id;

      // Send invoice
      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${invoiceId}/send`)
        .expect(201);

      // Storno invoice
      const stornoRes = await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'invoice',
          entityId: invoiceId,
          reason: 'Invoice test storno'
        })
        .expect(201);

      expect(stornoRes.body.id).toBe(invoiceId);
      expect(stornoRes.body.status).toBe('REVERTED');
    });
  });

  describe('Activity Log Integration', () => {
    it('should log storno activities', async () => {
      // Create, post, and storno a bill
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-ACTIVITY-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lineItems: [
            {
              description: 'Activity log test',
              quantity: 1,
              unitPrice: 150,
              taxCategoryId: '28'
            }
          ]
        })
        .expect(201);

      const billId = createRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/post`)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'Activity logging test'
        })
        .expect(201);

      // Check activities
      const activitiesRes = await request(app.getHttpServer())
        .get('/api/v1/operations/activities?limit=20')
        .expect(200);

      expect(Array.isArray(activitiesRes.body)).toBe(true);
      
      // Find the storno activity
      const stornoActivity = activitiesRes.body.find(
        (a: any) => a.type === 'BILL_STORNO' && a.entityId === billId
      );

      expect(stornoActivity).toBeDefined();
      expect(stornoActivity.summary).toContain('reverted');
    });
  });

  describe('Financial Snapshot Updates', () => {
    it('should update financial snapshot after storno', async () => {
      // Get initial snapshot
      const initialSnapshot = await request(app.getHttpServer())
        .get('/api/v1/operations/financial-snapshot')
        .expect(200);

      const initialExpenses = initialSnapshot.body.totalExpenses;

      // Create, post, and storno a bill
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/bills')
        .send({
          supplierId: 'SUP-SNAPSHOT-TEST',
          issueDate: '2026-02-17',
          currency: 'EUR',
          lineItems: [
            {
              description: 'Snapshot test',
              quantity: 2,
              unitPrice: 200,
              taxCategoryId: '43'
            }
          ]
        })
        .expect(201);

      const billId = createRes.body.id;

      // Post bill - should increase expenses
      await request(app.getHttpServer())
        .post(`/api/v1/bills/${billId}/post`)
        .expect(201);

      const afterPostSnapshot = await request(app.getHttpServer())
        .get('/api/v1/operations/financial-snapshot')
        .expect(200);

      expect(afterPostSnapshot.body.totalExpenses).toBe(initialExpenses + 400);

      // Storno - should decrease expenses back
      await request(app.getHttpServer())
        .post('/api/v1/operations/storno')
        .send({
          entityType: 'bill',
          entityId: billId,
          reason: 'Snapshot update test'
        })
        .expect(201);

      const afterStornoSnapshot = await request(app.getHttpServer())
        .get('/api/v1/operations/financial-snapshot')
        .expect(200);

      expect(afterStornoSnapshot.body.totalExpenses).toBe(initialExpenses);
    });
  });
});
