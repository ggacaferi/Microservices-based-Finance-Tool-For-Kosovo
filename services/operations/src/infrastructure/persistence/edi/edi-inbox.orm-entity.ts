import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

export type EdiInboxStatus = 'PENDING' | 'IMPORTED';

@Entity('ops_edi_inbox')
export class EdiInboxOrmEntity {
  /** UUID – unique per EDI document */
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  /** Tenant that RECEIVES this document */
  @Column({ type: 'uuid' })
  tenantId!: string;

  /** Tenant ID of the sender (the one who issued the invoice) */
  @Column({ type: 'uuid' })
  senderTenantId!: string;

  /** NUI of the sending business – shown in the inbox table */
  @Column({ type: 'varchar', length: 16 })
  senderBusinessId!: string;

  /** The originating invoice ID */
  @Column({ type: 'uuid' })
  messageId!: string;

  /** JSON snapshot of the invoice (lines, totals, optional senderTenantName) */
  @Column({ type: 'jsonb' })
  payload!: {
    issueDate: string;
    dueDate?: string | null;
    currency: string;
    totalNetAmount: number;
    senderTenantName?: string | null;
    lines: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      accountCode?: string;
    }>;
  };

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: EdiInboxStatus;

  /** Bill created by import-to-bill */
  @Column({ type: 'uuid', nullable: true })
  importedBillId!: string | null;

  @CreateDateColumn()
  receivedAt!: Date;
}
