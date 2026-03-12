import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('iam_tenants')
export class TenantOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
