import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BillStatus } from '../../../domain/bills/fatura-hyrese.aggregate';

@Entity('bills')
export class BillOrmEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid', nullable: true }) tenantId!: string;
  @Column() supplierId!: string;
  @Column({ type: 'date' }) issueDate!: string;
  @Column({ type: 'date', nullable: true }) dueDate?: string | null;
  @Column() currency!: string;
  @Column({ type: 'varchar' }) status!: BillStatus;
  @Column({ type: 'jsonb' }) lines!: { description: string; quantity: number; unitPrice: number; taxCategoryId: string; accountCode: string }[];
}
