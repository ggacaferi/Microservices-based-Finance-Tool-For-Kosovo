import { Injectable, Logger } from '@nestjs/common';

/** Must match IAM service default in non-production when IAM_OPS_SHARED_SECRET is unset. */
const DEV_IAM_OPS_SHARED_SECRET = 'guri-internal-nui-lookup';

/**
 * Resolves a business NUI to a tenant id via IAM (cross-tenant invoice → incoming bill).
 */
@Injectable()
export class IamTenantLookupService {
  private readonly logger = new Logger(IamTenantLookupService.name);
  private readonly baseUrl = process.env.IAM_SERVICE_URL || 'http://iam:3001';

  private serviceSecret(): string {
    const fromEnv = process.env.IAM_OPS_SHARED_SECRET?.trim();
    if (fromEnv) return fromEnv;
    if (process.env.NODE_ENV !== 'production') return DEV_IAM_OPS_SHARED_SECRET;
    return '';
  }

  async resolveTenantIdByNui(nui: string): Promise<string | null> {
    const secret = this.serviceSecret();
    if (!secret) {
      this.logger.warn('IAM_OPS_SHARED_SECRET is not set (required in production); cannot resolve receiver NUI.');
      return null;
    }
    const normalized = nui.trim().toUpperCase();
    const url = `${this.baseUrl}/api/v1/iam/internal/tenant-by-nui/${encodeURIComponent(normalized)}`;
    try {
      const res = await fetch(url, { headers: { 'x-operations-secret': secret } });
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`IAM NUI lookup failed: HTTP ${res.status} ${text}`);
        return null;
      }
      const data = (await res.json()) as { tenantId?: string };
      return data?.tenantId ?? null;
    } catch (e: any) {
      this.logger.warn(`IAM NUI lookup error: ${e?.message || e}`);
      return null;
    }
  }

  async resolveNuiByTenantId(tenantId: string): Promise<string | null> {
    const secret = this.serviceSecret();
    if (!secret) return null;
    const url = `${this.baseUrl}/api/v1/iam/internal/tenant-nui-by-id/${encodeURIComponent(tenantId)}`;
    try {
      const res = await fetch(url, { headers: { 'x-operations-secret': secret } });
      if (!res.ok) return null;
      const data = (await res.json()) as { nui?: string | null };
      return data?.nui ?? null;
    } catch (e: any) {
      this.logger.warn(`IAM NUI-by-tenantId lookup error: ${e?.message || e}`);
      return null;
    }
  }

  async resolveTenantLabelById(tenantId: string): Promise<{ name: string; nui: string | null } | null> {
    const secret = this.serviceSecret();
    if (!secret) return null;
    const url = `${this.baseUrl}/api/v1/iam/internal/tenant-label/${encodeURIComponent(tenantId)}`;
    try {
      const res = await fetch(url, { headers: { 'x-operations-secret': secret } });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return (await res.json()) as { name: string; nui: string | null };
    } catch (e: any) {
      this.logger.warn(`IAM tenant-label lookup error: ${e?.message || e}`);
      return null;
    }
  }
}
