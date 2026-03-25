import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillStatus, FaturaHyrese } from '../domain/bills/fatura-hyrese.aggregate';
import { BillOrmEntity } from './persistence/bills/bill.orm-entity';

@Injectable()
export class BillRepository {
  private readonly logger = new Logger(BillRepository.name);
  private readonly mem = new Map<string, FaturaHyrese>();
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }

  constructor(
    @Optional() @InjectRepository(BillOrmEntity, 'operations')
    private readonly orm?: Repository<BillOrmEntity>,
  ) {
    this.logger.log(this.orm ? 'BillRepository: Postgres' : 'BillRepository: in-memory');
  }

  async save(tenantId: string, agg: FaturaHyrese): Promise<void> {
    this.mem.set(this.key(tenantId, agg.id), agg);
    if (!this.orm) return;
    await this.orm.save({
      id: agg.id, tenantId, supplierId: agg.supplierId,
      issueDate: agg.issueDate instanceof Date ? agg.issueDate.toISOString().split('T')[0] : String(agg.issueDate),
      dueDate: agg.dueDate ? (agg.dueDate instanceof Date ? agg.dueDate.toISOString().split('T')[0] : String(agg.dueDate)) : null,
      currency: agg.currency, status: agg.status,
      lines: agg.lines.map((l: { description: string; quantity: number; unitPrice: number; taxCategoryId: string; accountCode: string }) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, taxCategoryId: l.taxCategoryId, accountCode: l.accountCode })),
    });
  }

  async findById(tenantId: string, id: string): Promise<FaturaHyrese | null> {
    const cached = this.mem.get(this.key(tenantId, id));
    if (cached) return cached;
    if (!this.orm) return null;
    const row = await this.orm.findOneBy({ id, tenantId });
    return row ? this.toDomain(tenantId, row) : null;
  }

  async list(tenantId: string): Promise<FaturaHyrese[]> {
    if (this.orm) return (await this.orm.find({ where: { tenantId }, order: { issueDate: 'DESC' } })).map(r => this.toDomain(tenantId, r));
    return Array.from(this.mem.entries()).filter(([k]) => k.startsWith(`${tenantId}:`)).map(([, v]) => v).sort((a, b) => a.issueDate > b.issueDate ? -1 : 1);
  }

  async listByStatus(tenantId: string, status: BillStatus): Promise<FaturaHyrese[]> {
    if (this.orm) return (await this.orm.findBy({ tenantId, status })).map(r => this.toDomain(tenantId, r));
    return (await this.list(tenantId)).filter(b => b.status === status);
  }

  private toDomain(tenantId: string, row: BillOrmEntity): FaturaHyrese {
    const agg = FaturaHyrese.rehydrate(row.id, { supplierId: row.supplierId, issueDate: new Date(row.issueDate), dueDate: row.dueDate ? new Date(row.dueDate) : null, currency: row.currency, lines: row.lines }, row.status);
    this.mem.set(this.key(tenantId, agg.id), agg);
    return agg;
  }
}
