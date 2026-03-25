import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ops_invoices')
export class InvoiceOrmEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid', nullable: true }) tenantId!: string;
  @Column() customerId!: string;
  @Column({ type: 'date' }) issueDate!: string;
  @Column({ type: 'date', nullable: true }) dueDate!: string | null;
  @Column({ type: 'varchar', length: 10 }) currency!: string;
  @Column({ type: 'varchar', length: 20 }) status!: string;
  @Column({ type: 'jsonb' }) lines!: { description: string; quantity: number; unitPrice: number; accountCode: string }[];
  @CreateDateColumn() createdAt!: Date;
}
