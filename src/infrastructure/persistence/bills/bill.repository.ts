import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BillStatus,
  FaturaHyrese
} from '../../../domain/bills/fatura-hyrese.aggregate';
import { BillOrmEntity } from './bill.orm-entity';

/**
 * Bill Repository — Postgres-backed (ops-db) with in-memory fallback
 *
 * In Kubernetes, each Operations pod connects to its own Postgres instance
 * via OPS_DB_HOST. Locally, falls back to in-memory Map.
 */
@Injectable()
export class BillRepository {
  private readonly logger = new Logger(BillRepository.name);
  private readonly items = new Map<string, FaturaHyrese>();

  constructor(
    @Optional() @InjectRepository(BillOrmEntity, 'operations')
    private readonly ormRepo?: Repository<BillOrmEntity>,
  ) {
    if (this.ormRepo) {
      this.logger.log('BillRepository: Postgres-backed (bills table)');
    } else {
      this.logger.log('BillRepository: in-memory fallback');
    }
  }

  async save(aggregate: FaturaHyrese): Promise<void> {
    this.items.set(aggregate.id, aggregate);
    if (this.ormRepo) {
      await this.ormRepo.save({
        id: aggregate.id,
        supplierId: aggregate.supplierId,
        issueDate: aggregate.issueDate instanceof Date
          ? aggregate.issueDate.toISOString().split('T')[0]
          : String(aggregate.issueDate),
        dueDate: aggregate.dueDate
          ? (aggregate.dueDate instanceof Date
            ? aggregate.dueDate.toISOString().split('T')[0]
            : String(aggregate.dueDate))
          : null,
        currency: aggregate.currency,
        status: aggregate.status,
        lines: aggregate.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxCategoryId: String(l.taxCategoryId),
        })),
      });
    }
  }

  async findById(id: string): Promise<FaturaHyrese | null> {
    const cached = this.items.get(id);
    if (cached) return cached;
    if (!this.ormRepo) return null;
    const row = await this.ormRepo.findOneBy({ id });
    if (!row) return null;
    return this.toDomain(row);
  }

  async list(): Promise<FaturaHyrese[]> {
    if (this.ormRepo) {
      const rows = await this.ormRepo.find({ order: { issueDate: 'DESC' } });
      return rows.map((r) => this.toDomain(r));
    }
    return Array.from(this.items.values()).sort((a, b) =>
      a.issueDate > b.issueDate ? -1 : 1
    );
  }

  async listByStatus(status: BillStatus): Promise<FaturaHyrese[]> {
    if (this.ormRepo) {
      const rows = await this.ormRepo.findBy({ status });
      return rows.map((r) => this.toDomain(r));
    }
    const all = await this.list();
    return all.filter((bill) => bill.status === status);
  }

  private toDomain(row: BillOrmEntity): FaturaHyrese {
    const agg = FaturaHyrese.rehydrate(
      row.id,
      {
        supplierId: row.supplierId,
        issueDate: new Date(row.issueDate),
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        currency: row.currency,
        lines: row.lines,
      },
      row.status,
    );
    this.items.set(agg.id, agg);
    return agg;
  }
}

