import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('ops_inventory_movements')
export class InventoryMovementOrmEntity {
  @PrimaryColumn({ type: 'uuid' }) id!: string;
  @Column({ type: 'uuid', nullable: true }) tenantId!: string;
  @Column() sku!: string;
  @Column() description!: string;
  @Column({ type: 'varchar', length: 10 }) type!: string;
  @Column({ type: 'decimal', precision: 15, scale: 4 }) quantity!: number;
  @Column({ type: 'decimal', precision: 15, scale: 4 }) unitCost!: number;
  @Column({ type: 'text', nullable: true }) note!: string | null;
  @Column({ type: 'uuid', nullable: true }) reversedByMovementId!: string | null;
  @CreateDateColumn() createdAt!: Date;
}
