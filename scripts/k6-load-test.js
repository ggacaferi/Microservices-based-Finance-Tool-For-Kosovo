import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

export const options = {
  stages: [
    { duration: '20s', target: 5 },
    { duration: '20s', target: 10 },
    { duration: '20s', target: 20 },
  ],
  summaryTrendStats: ['avg', 'p(95)', 'p(99)'],
};

const createBillLatency = new Trend('create_bill_latency');
const postBillLatency = new Trend('post_bill_latency');
const trialBalanceLatency = new Trend('trial_balance_latency');
const journalEntriesLatency = new Trend('journal_entries_latency');

const jsonHeaders = {
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': '00000000-0000-0000-0000-000000000001',
  },
};
const baseUrl = __ENV.BASE_URL || 'http://localhost:3000/api/v1';

export default function () {
  let response = http.post(`${baseUrl}/bills/`, JSON.stringify({
    supplierId: '123e4567-e89b-12d3-a456-426614174000',
    issueDate: '2026-06-03',
    currency: 'EUR',
    lineItems: [{ description: 'Load test invoice', quantity: 1, unitPrice: 100, taxCategoryId: '43', accountCode: '665-02' }],
  }), jsonHeaders);
  createBillLatency.add(response.timings.duration);
  check(response, { 'create bill succeeded': (r) => r.status === 201 });
  const billId = response.json('id');

  response = http.post(`${baseUrl}/bills/${billId}/post`, '{}', jsonHeaders);
  postBillLatency.add(response.timings.duration);
  check(response, { 'post bill succeeded': (r) => r.status === 201 });

  response = http.get(`${baseUrl}/ledger/trial-balance`);
  trialBalanceLatency.add(response.timings.duration);
  check(response, { 'trial balance succeeded': (r) => r.status === 200 });

  response = http.get(`${baseUrl}/ledger/journal-entries`);
  journalEntriesLatency.add(response.timings.duration);
  check(response, { 'journal entries succeeded': (r) => r.status === 200 });

  sleep(1);
}