import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('ledger_ingested_events')
@Unique('uq_ledger_ingested_event_event_id', ['eventId'])
export class LedgerIngestedEventOrmEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 120, nullable: true })
	eventId!: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	tenantId!: string | null;

	@Column({ type: 'varchar', length: 80, nullable: true })
	eventType!: string | null;

	@Column({ type: 'varchar', length: 160, nullable: true })
	idempotencyKey!: string | null;

	@CreateDateColumn({ type: 'timestamptz' })
	ingestedAt!: Date;
}
