import { ActivityLogService } from '../src/application/operations/activity-log.service';

describe('ActivityLogService', () => {
  it('records with metadata and lists with numeric limit', () => {
    const svc = new ActivityLogService();
    svc.record('X', {
      entityId: 'e1',
      summary: 's',
      metadata: { k: 1 },
    });
    svc.record('Y', { entityId: 'e2', summary: 's2' });
    expect(svc.list(1).length).toBe(1);
    expect(svc.list().length).toBeGreaterThanOrEqual(2);
  });
});
