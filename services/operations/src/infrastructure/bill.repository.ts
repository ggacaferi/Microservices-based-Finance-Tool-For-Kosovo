import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, FaturaHyrese } from '../domain/bills/fatura-hyrese.aggregate';
import { BillOrmEntity } from './persistence/bills/bill.orm-entity';

@Injectable()
export class BillRepository {
  private readonly logger = new Logger(BillRepository.name);
  private readonly mem = new Map<string, FaturaHyrese>();

  constructor(
    @Optional() @InjectRepository(BillOrmEntity, 'operations')
    private readonly orm?: Repository<BillOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'BillRepository: Postgres' : 'BillRepository: in-memory');
  }

  async save(agg: FaturaHyrese): Promise<void> {
    this.mem.set(agg.id, agg);
    if (!this.orm) return;
    await this.orm.save({
      id: agg.id, supplierId: agg.supplierId,
      issueDate: agg.issueDate instanceof Date ? agg.issueDate.toISOString().split('T')[0] : String(agg.issueDate),
      dueDate: agg.dueDate ? (agg.dueDate instanceof Date ? agg.dueDate.toISOString().split('T')[0] : String(agg.dueDate)) : null,
      currency: agg.currency, status: agg.status,
      lines: agg.lines.map((l: { description: string; quantity: number; unitPrice: number; taxCategoryId: string }) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId })),
    });
  }

  async findById(id: string): Promise<FaturaHyrese | null> {
    const cached = this.mem.get(id);
    if (cached) return cached;
    if (!this.orm) return null;
    const row = await this.orm.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async list(): Promise<FaturaHyrese[]> {
    if (this.orm) return (await this.orm.find({ order: { issueDate: 'DESC' } })).map(r => this.toDomain(r));
    return Array.from(this.mem.values()).sort((a, b) => a.issueDate > b.issueDate ? -1 : 1);
  }

  async listByStatus(status: BillStatus): Promise<FaturaHyrese[]> {
    if (this.orm) return (await this.orm.findBy({ status })).map(r => this.toDomain(r));
    return (await this.list()).filter(b => b.status === status);
  }

  private toDomain(row: BillOrmEntity): FaturaHyrese {
    const agg = FaturaHyrese.rehydrate(row.id, { supplierId: row.supplierId, issueDate: new Date(row.issueDate), dueDate: row.dueDate ? new Date(row.dueDate) : null, currency: row.currency, lines: row.lines }, row.status);
    this.mem.set(agg.id, agg);
    return agg;
  }
}
