import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../domain/user.entity';
import { UserOrmEntity } from './user.orm-entity';

/**
 * User Repository — Postgres-backed with in-memory fallback
 *
 * When TypeORM is connected (POSTGRES_HOST set), persists to iam_users table.
 * Otherwise falls back to in-memory Map for local development.
 */
@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);
  private readonly memStore = new Map<string, User>();

  constructor(
    @Optional() @InjectRepository(UserOrmEntity, 'iam')
    private readonly ormRepo?: Repository<UserOrmEntity>,
  ) {
    if (this.ormRepo) {
      this.logger.log('UserRepository: Postgres-backed (iam_users)');
    } else {
      this.logger.log('UserRepository: in-memory fallback');
    }
  }

  async save(user: User): Promise<void> {
    this.memStore.set(user.id, user);
    if (this.ormRepo) {
      await this.ormRepo.save({
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        tenantId: user.tenantId,
        role: user.role,
        active: user.active,
      });
    }
  }

  async findById(id: string): Promise<User | undefined> {
    const cached = this.memStore.get(id);
    if (cached) return cached;
    if (!this.ormRepo) return undefined;
    const row = await this.ormRepo.findOneBy({ id });
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.memStore.values()) {
      if (user.email === normalized) return user;
    }
    if (!this.ormRepo) return undefined;
    const row = await this.ormRepo.findOneBy({ email: normalized });
    if (!row) return undefined;
    return this.toDomain(row);
  }

  async findByTenant(tenantId: string): Promise<User[]> {
    if (this.ormRepo) {
      const rows = await this.ormRepo.findBy({ tenantId });
      return rows.map((r) => this.toDomain(r));
    }
    return [...this.memStore.values()].filter((u) => u.tenantId === tenantId);
  }

  async list(): Promise<User[]> {
    if (this.ormRepo) {
      const rows = await this.ormRepo.find();
      return rows.map((r) => this.toDomain(r));
    }
    return [...this.memStore.values()];
  }

  private toDomain(row: UserOrmEntity): User {
    const user = User.rehydrate(
      row.id,
      row.email,
      row.passwordHash,
      row.fullName,
      row.tenantId,
      row.role as UserRole,
      row.active,
      row.createdAt.toISOString(),
    );
    this.memStore.set(user.id, user);
    return user;
  }
}
