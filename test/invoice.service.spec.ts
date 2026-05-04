import { NotFoundException } from '@nestjs/common';
import { ActivityLogService } from '../src/application/operations/activity-log.service';
import {
  InvoiceService,
  InvoiceStatus,
} from '../src/application/invoices/invoice.service';

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(() => {
    service = new InvoiceService(new ActivityLogService());
  });

  it('creates draft, send, pay, reverse with optional dueDate', () => {
    const inv = service.createDraft({
      customerId: 'C1',
      issueDate: '2026-01-10',
      dueDate: '2026-01-20',
      currency: 'EUR',
      lines: [{ description: 'A', quantity: 2, unitPrice: 10 }],
    });
    expect(inv.status).toBe(InvoiceStatus.Draft);
    expect(inv.dueDate).toBe('2026-01-20');

    const sent = service.send(inv.id);
    expect(sent.status).toBe(InvoiceStatus.Sent);

    const paid = service.pay(inv.id);
    expect(paid.status).toBe(InvoiceStatus.Paid);

    const rev = service.reverse(inv.id, '');
    expect(rev.status).toBe(InvoiceStatus.Reverted);
  });

  it('rejects empty lines', () => {
    expect(() =>
      service.createDraft({
        customerId: 'C1',
        issueDate: '2026-01-10',
        currency: 'EUR',
        lines: [],
      }),
    ).toThrow(/At least one invoice line/);
  });

  it('rejects wrong status transitions', () => {
    const inv = service.createDraft({
      customerId: 'C1',
      issueDate: '2026-01-10',
      currency: 'EUR',
      lines: [{ description: 'A', quantity: 1, unitPrice: 1 }],
    });
    expect(() => service.pay(inv.id)).toThrow(/only be paid from SENT/);
    expect(() => service.reverse(inv.id, 'x')).toThrow(/SENT or PAID/);
  });

  it('lists and totals', () => {
    const a = service.createDraft({
      customerId: 'C1',
      issueDate: '2026-02-01',
      currency: 'EUR',
      lines: [{ description: 'A', quantity: 1, unitPrice: 100 }],
    });
    const b = service.createDraft({
      customerId: 'C1',
      issueDate: '2026-01-01',
      currency: 'EUR',
      lines: [{ description: 'B', quantity: 2, unitPrice: 5 }],
    });
    const list = service.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(service.totalNetAmount(a)).toBe(100);
    expect(service.totalNetAmount(b)).toBe(10);
  });

  it('throws NotFoundException for missing id', () => {
    expect(() => service.get('missing')).toThrow(NotFoundException);
  });
});
