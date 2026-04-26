import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../domain/tenant.entity';
import { TenantOrmEntity } from './tenant.orm-entity';

/**
 * Tenant Repository — Postgres-backed with in-memory fallback
 */
@Injectable()
export class TenantRepository {
  private readonly logger = new Logger(TenantRepository.name);
  private readonly memStore = new Map<string, Tenant>();

  constructor(
    @Optional() @InjectRepository(TenantOrmEntity, 'iam')
    private readonly ormRepo?: Repository<TenantOrmEntity>,
  ) {
    if (this.ormRepo) {
      this.logger.log('TenantRepository: Postgres-backed (iam_tenants)');
    } else {
      this.logger.log('TenantRepository: in-memory fallback');
    }
  }

  async save(tenant: Tenant): Promise<void> {
    this.memStore.set(tenant.id, tenant);
    if (this.ormRepo) {
      const exists = (await this.ormRepo.count({ where: { id: tenant.id } })) > 0;
      const nuiForDb = tenant.nui?.trim() && /^8\d{8}$/.test(tenant.nui.trim()) ? tenant.nui.trim().toUpperCase() : null;
      const payload = {
        name: tenant.name,
        slug: tenant.slug,
        nui: nuiForDb,
        active: tenant.active,
      };
      if (exists) {
        await this.ormRepo.update({ id: tenant.id }, payload);
      } else {
        await this.ormRepo.save({
          id: tenant.id,
          ...payload,
        });
      }
    }
  }

  async findById(id: string): Promise<Tenant | undefined> {
    const cached = this.memStore.get(id);
    if (cached) return cached;
    if (!this.ormRepo) return undefined;
    const row = await this.ormRepo.findOneBy({ id });
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async findByNui(nui: string): Promise<Tenant | undefined> {
    const normalized = nui.trim().toUpperCase();
    if (!/^8\d{8}$/.test(normalized)) return undefined;
    for (const t of this.memStore.values()) {
      if (t.active && t.nui === normalized) return t;
    }
    if (!this.ormRepo) return undefined;
    const row = await this.ormRepo
      .createQueryBuilder('t')
      .where('t.active = :active', { active: true })
      .andWhere('UPPER(TRIM(t.nui)) = :nui', { nui: normalized })
      .getOne();
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    for (const t of this.memStore.values()) {
      if (t.slug === slug) return t;
    }
    if (!this.ormRepo) return undefined;
    const row = await this.ormRepo.findOneBy({ slug });
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async list(): Promise<Tenant[]> {
    if (this.ormRepo) {
      const rows = await this.ormRepo.find();
      return rows.map((r) => this.toDomain(r));
    }
    return [...this.memStore.values()];
  }

  private toDomain(row: TenantOrmEntity): Tenant {
    const raw = row.nui;
    let normalizedNui =
      raw != null && String(raw).trim() !== '' ? String(raw).trim().toUpperCase() : '';
    if (normalizedNui && !/^8\d{8}$/.test(normalizedNui)) {
      normalizedNui = '';
    }
    const tenant = Tenant.rehydrate(row.id, row.name, row.slug, normalizedNui, row.active, row.createdAt.toISOString());
    this.memStore.set(tenant.id, tenant);
    return tenant;
  }
}
