import { Injectable } from '@nestjs/common';
import {
  BillStatus,
  FaturaHyrese
} from '../../../domain/bills/fatura-hyrese.aggregate';

@Injectable()
export class BillRepository {
  private readonly items = new Map<string, FaturaHyrese>();

  async save(aggregate: FaturaHyrese): Promise<void> {
    this.items.set(aggregate.id, aggregate);
  }

  async findById(id: string): Promise<FaturaHyrese | null> {
    return this.items.get(id) ?? null;
  }

  async list(): Promise<FaturaHyrese[]> {
    return Array.from(this.items.values()).sort((a, b) =>
      a.issueDate > b.issueDate ? -1 : 1
    );
  }

  async listByStatus(status: BillStatus): Promise<FaturaHyrese[]> {
    const all = await this.list();
    return all.filter((bill) => bill.status === status);
  }
}

