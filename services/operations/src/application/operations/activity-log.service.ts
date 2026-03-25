import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface ActivityLogEntry {
  id: string; tenantId: string; type: string; entityId?: string; summary: string; at: string; metadata?: Record<string, unknown>;
}

@Injectable()
export class ActivityLogService {
  private readonly entries: ActivityLogEntry[] = [];

  record(tenantId: string, type: string, payload: { entityId?: string; summary: string; metadata?: Record<string, unknown> }): ActivityLogEntry {
    const entry: ActivityLogEntry = { id: uuidv4(), tenantId, type, entityId: payload.entityId, summary: payload.summary, at: new Date().toISOString(), metadata: payload.metadata };
    this.entries.unshift(entry);
    this.entries.splice(100);
    return entry;
  }

  list(tenantId: string, limit = 20): ActivityLogEntry[] {
    return this.entries.filter(e => e.tenantId === tenantId).slice(0, Math.min(limit, 100));
  }
}
