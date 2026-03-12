import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { User, UserRole } from '../domain/user.entity';
import { Tenant } from '../domain/tenant.entity';
import { UserRepository } from '../infrastructure/user.repository';
import { TenantRepository } from '../infrastructure/tenant.repository';

export interface JwtPayload {
  sub: string;       // user ID
  email: string;
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    role: UserRole;
  };
}

export interface AuditEntry {
  id: string;
  userId: string;
  email: string;
  tenantId: string;
  action: string;
  resource: string;
  timestamp: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || 'guri-finance-jwt-secret-2026';
  private readonly TOKEN_TTL = 3600; // 1 hour
  private readonly auditLog: AuditEntry[] = [];

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  /**
   * Register a new tenant with its first admin user (persisted to Postgres)
   */
  async registerTenant(tenantName: string, email: string, password: string, fullName: string): Promise<AuthTokens> {
    const slug = tenantName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (await this.tenantRepository.findBySlug(slug)) {
      throw new ConflictException(`Tenant "${tenantName}" already exists.`);
    }

    if (await this.userRepository.findByEmail(email)) {
      throw new ConflictException(`Email "${email}" is already registered.`);
    }

    const tenant = Tenant.create(tenantName);
    await this.tenantRepository.save(tenant);

    const user = User.create({ email, password, fullName, tenantId: tenant.id, role: 'admin' });
    await this.userRepository.save(user);

    this.recordAudit(user, 'TENANT_REGISTERED', `tenant:${tenant.id}`);
    return this.issueTokens(user);
  }

  /**
   * Authenticate a user against Postgres
   */
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!user.verifyPassword(password)) {
      this.recordAudit(user, 'LOGIN_FAILED', `user:${user.id}`);
      throw new UnauthorizedException('Invalid credentials.');
    }

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant || !tenant.active) {
      throw new UnauthorizedException('Tenant is deactivated.');
    }

    this.recordAudit(user, 'LOGIN_SUCCESS', `user:${user.id}`);
    return this.issueTokens(user);
  }

  /**
   * Add a user to an existing tenant (admin-only, persisted to Postgres)
   */
  async createUser(
    requestingUserId: string,
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
  ): Promise<{ id: string; email: string; fullName: string; role: UserRole; tenantId: string }> {
    const requestor = await this.userRepository.findById(requestingUserId);
    if (!requestor) throw new NotFoundException('Requesting user not found.');
    if (!requestor.hasPermission('admin')) {
      throw new UnauthorizedException('Only admins can create users.');
    }

    if (await this.userRepository.findByEmail(email)) {
      throw new ConflictException(`Email "${email}" is already registered.`);
    }

    const user = User.create({ email, password, fullName, tenantId: requestor.tenantId, role });
    await this.userRepository.save(user);

    this.recordAudit(requestor, 'USER_CREATED', `user:${user.id}`);
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId };
  }

  /**
   * Verify a JWT and return the payload (used by the API Gateway auth guard)
   */
  verifyToken(token: string): JwtPayload {
    try {
      const [headerB64, payloadB64, signatureB64] = token.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) {
        throw new Error('Malformed token');
      }

      const payload: JwtPayload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8'),
      );

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      const expectedSig = this.sign(`${headerB64}.${payloadB64}`);
      if (expectedSig !== signatureB64) {
        throw new Error('Invalid signature');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  /**
   * List users in a tenant (reads from Postgres)
   */
  async listUsers(tenantId: string): Promise<Array<{
    id: string; email: string; fullName: string; role: UserRole; active: boolean; createdAt: string;
  }>> {
    const users = await this.userRepository.findByTenant(tenantId);
    return users.map((u) => ({
      id: u.id, email: u.email, fullName: u.fullName,
      role: u.role, active: u.active, createdAt: u.createdAt,
    }));
  }

  /**
   * List tenants (reads from Postgres)
   */
  async listTenants(): Promise<Array<{ id: string; name: string; slug: string; active: boolean; createdAt: string }>> {
    const tenants = await this.tenantRepository.list();
    return tenants.map((t) => ({
      id: t.id, name: t.name, slug: t.slug, active: t.active, createdAt: t.createdAt,
    }));
  }

  getAuditLog(limit = 50): AuditEntry[] {
    return this.auditLog.slice(0, limit);
  }

  // ── Private helpers ─────────────────────────────────────────

  private issueTokens(user: User): AuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.id, email: user.email, tenantId: user.tenantId,
      role: user.role, iat: now, exp: now + this.TOKEN_TTL,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(`${header}.${body}`);
    const accessToken = `${header}.${body}.${signature}`;

    return {
      accessToken,
      expiresIn: this.TOKEN_TTL,
      user: { id: user.id, email: user.email, fullName: user.fullName, tenantId: user.tenantId, role: user.role },
    };
  }

  private sign(data: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', this.JWT_SECRET).update(data).digest('base64url');
  }

  private recordAudit(user: User, action: string, resource: string): void {
    this.auditLog.unshift({
      id: require('uuid').v4(),
      userId: user.id, email: user.email, tenantId: user.tenantId,
      action, resource, timestamp: new Date().toISOString(),
    });
    if (this.auditLog.length > 500) this.auditLog.length = 500;
  }
}
