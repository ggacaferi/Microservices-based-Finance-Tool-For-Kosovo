import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('iam_users')
export class UserOrmEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  fullName!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
