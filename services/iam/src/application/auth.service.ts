import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { User, UserRole } from '../domain/user.entity';
import { Tenant } from '../domain/tenant.entity';
import { UserRepository } from '../infrastructure/user.repository';
import { TenantRepository } from '../infrastructure/tenant.repository';

export interface JwtPayload {
  sub: string;       // user ID
  email: string;
  tenantId: string;
  role: UserRole;
  mustChangePassword: boolean;
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
    mustChangePassword: boolean;
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
  private readonly TOKEN_TTL = 28800; // 8 hours
  private readonly auditLog: AuditEntry[] = [];
  private readonly pendingRegistrations = new Map<string, {
    tenantName: string;
    nui: string;
    email: string;
    password: string;
    fullName: string;
    code: string;
    expiresAt: number;
    attempts: number;
  }>();
  private readonly REG_CODE_TTL_SEC = 600; // 10 min
  private readonly REG_MAX_ATTEMPTS = 5;
  private readonly pendingPasswordResets = new Map<string, {
    userId: string;
    email: string;
    code: string;
    expiresAt: number;
    attempts: number;
  }>();
  private readonly RESET_CODE_TTL_SEC = 600; // 10 min
  private readonly RESET_MAX_ATTEMPTS = 5;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
  ) {}

  /**
   * Request signup verification code
   */
  async requestRegistrationCode(tenantName: string, nui: string, email: string, password: string, fullName: string): Promise<{ message: string; expiresIn: number }> {
    const slug = tenantName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (await this.tenantRepository.findBySlug(slug)) {
      throw new ConflictException(`Tenant "${tenantName}" already exists.`);
    }

    if (await this.userRepository.findByEmail(email)) {
      throw new ConflictException(`Email "${email}" is already registered.`);
    }

    const code = this.generate4DigitCode();
    const normalizedEmail = email.toLowerCase().trim();
    this.pendingRegistrations.set(normalizedEmail, {
      tenantName,
      nui,
      email: normalizedEmail,
      password,
      fullName,
      code,
      expiresAt: Date.now() + this.REG_CODE_TTL_SEC * 1000,
      attempts: 0,
    });

    await this.sendCodeEmail(normalizedEmail, code, 'account verification');

    return {
      message: 'Verification code sent to email.',
      expiresIn: this.REG_CODE_TTL_SEC,
    };
  }

  /**
   * Verify signup code and create tenant + admin user
   */
  async verifyRegistrationCode(email: string, code: string): Promise<AuthTokens> {
    const normalizedEmail = email.toLowerCase().trim();
    const pending = this.pendingRegistrations.get(normalizedEmail);
    if (!pending) throw new UnauthorizedException('No pending verification found for this email.');
    if (pending.expiresAt < Date.now()) {
      this.pendingRegistrations.delete(normalizedEmail);
      throw new UnauthorizedException('Verification code expired. Please request a new one.');
    }
    if (pending.attempts >= this.REG_MAX_ATTEMPTS) {
      this.pendingRegistrations.delete(normalizedEmail);
      throw new UnauthorizedException('Too many invalid attempts. Please request a new code.');
    }
    if (pending.code !== String(code).trim()) {
      pending.attempts += 1;
      throw new UnauthorizedException('Invalid verification code.');
    }

    const slug = pending.tenantName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (await this.tenantRepository.findBySlug(slug)) {
      this.pendingRegistrations.delete(normalizedEmail);
      throw new ConflictException(`Tenant "${pending.tenantName}" already exists.`);
    }
    if (await this.userRepository.findByEmail(normalizedEmail)) {
      this.pendingRegistrations.delete(normalizedEmail);
      throw new ConflictException(`Email "${normalizedEmail}" is already registered.`);
    }

    const tenant = Tenant.create(pending.tenantName, pending.nui);
    await this.tenantRepository.save(tenant);

    const user = User.create({ email: pending.email, password: pending.password, fullName: pending.fullName, tenantId: tenant.id, role: 'admin' });
    await this.userRepository.save(user);

    this.pendingRegistrations.delete(normalizedEmail);
    this.recordAudit(user, 'TENANT_REGISTERED', `tenant:${tenant.id}`);
    return this.issueTokens(user);
  }

  // Legacy entry point now requests code first
  async registerTenant(tenantName: string, nui: string, email: string, password: string, fullName: string): Promise<{ message: string; expiresIn: number }> {
    return this.requestRegistrationCode(tenantName, nui, email, password, fullName);
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

    if (!user.tenantId?.trim()) {
      throw new UnauthorizedException('User is not assigned to a company.');
    }
    if (!user.role) {
      throw new UnauthorizedException('User does not have a role assigned.');
    }

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant || !tenant.active) {
      throw new UnauthorizedException('Tenant is deactivated.');
    }

    this.recordAudit(user, 'LOGIN_SUCCESS', `user:${user.id}`);
    return this.issueTokens(user);
  }

  async requestPasswordResetCode(email: string): Promise<{ message: string; expiresIn: number }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user || !user.active) {
      return {
        message: 'If this email exists, a reset code has been sent.',
        expiresIn: this.RESET_CODE_TTL_SEC,
      };
    }

    const code = this.generate4DigitCode();
    this.pendingPasswordResets.set(normalizedEmail, {
      userId: user.id,
      email: normalizedEmail,
      code,
      expiresAt: Date.now() + this.RESET_CODE_TTL_SEC * 1000,
      attempts: 0,
    });

    await this.sendCodeEmail(normalizedEmail, code, 'password reset');

    return {
      message: 'If this email exists, a reset code has been sent.',
      expiresIn: this.RESET_CODE_TTL_SEC,
    };
  }

  async verifyPasswordResetCode(email: string, code: string, newPassword: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const pending = this.pendingPasswordResets.get(normalizedEmail);
    if (!pending) throw new UnauthorizedException('No pending reset found for this email.');
    if (pending.expiresAt < Date.now()) {
      this.pendingPasswordResets.delete(normalizedEmail);
      throw new UnauthorizedException('Reset code expired. Please request a new one.');
    }
    if (pending.attempts >= this.RESET_MAX_ATTEMPTS) {
      this.pendingPasswordResets.delete(normalizedEmail);
      throw new UnauthorizedException('Too many invalid attempts. Please request a new code.');
    }
    if (pending.code !== String(code).trim()) {
      pending.attempts += 1;
      throw new UnauthorizedException('Invalid reset code.');
    }

    const user = await this.userRepository.findById(pending.userId);
    if (!user || !user.active) {
      this.pendingPasswordResets.delete(normalizedEmail);
      throw new NotFoundException('User not found.');
    }

    user.setPassword(newPassword);
    await this.userRepository.save(user);
    this.pendingPasswordResets.delete(normalizedEmail);
    this.recordAudit(user, 'PASSWORD_RESET_SUCCESS', `user:${user.id}`);
    return { message: 'Password reset successful. You can now login.' };
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

    const user = User.create({ email, password, fullName, tenantId: requestor.tenantId, role, mustChangePassword: true });
    await this.userRepository.save(user);

    const tenant = await this.tenantRepository.findById(requestor.tenantId);
    await this.sendInvitationEmail(user.email, password, tenant?.name || 'your company', requestor.fullName, role);

    this.recordAudit(requestor, 'USER_CREATED', `user:${user.id}`);
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, tenantId: user.tenantId };
  }

  async updateMyProfile(userId: string, dto: { fullName?: string; email?: string }): Promise<AuthTokens> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('User not found.');

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const existing = await this.userRepository.findByEmail(dto.email);
      if (existing && existing.id !== user.id) {
        throw new ConflictException(`Email "${dto.email}" is already registered.`);
      }
    }

    user.updateProfile({ fullName: dto.fullName, email: dto.email });
    await this.userRepository.save(user);
    this.recordAudit(user, 'PROFILE_UPDATED', `user:${user.id}`);
    return this.issueTokens(user);
  }

  async updateBusinessProfile(userId: string, dto: { tenantName?: string; nui?: string }): Promise<{ id: string; name: string; slug: string; nui: string; active: boolean }> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('User not found.');
    if (!user.hasPermission('admin')) throw new UnauthorizedException('Only admins can update business profile.');

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant) throw new NotFoundException('Tenant not found.');

    if (dto.nui !== undefined && dto.nui.trim()) {
      const normalized = dto.nui.trim().toUpperCase();
      const others = (await this.tenantRepository.list()).filter((t) => t.id !== tenant.id);
      if (others.some((t) => /^8\d{8}$/.test(t.nui) && t.nui === normalized)) {
        throw new ConflictException('This NUI is already registered to another company.');
      }
    }

    try {
      tenant.updateBusiness({ name: dto.tenantName, nui: dto.nui });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NUI is incorrect' || msg === 'Tenant name is required.') {
        throw new BadRequestException(msg);
      }
      throw e;
    }

    try {
      await this.tenantRepository.save(tenant);
    } catch (e) {
      if (e instanceof QueryFailedError) {
        const code = (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code;
        if (code === '23505') {
          throw new ConflictException('This NUI is already in use.');
        }
      }
      throw e;
    }
    this.recordAudit(user, 'BUSINESS_PROFILE_UPDATED', `tenant:${tenant.id}`);

    return { id: tenant.id, name: tenant.name, slug: tenant.slug, nui: tenant.nui, active: tenant.active };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<AuthTokens> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException('User not found.');
    if (!user.verifyPassword(currentPassword)) throw new UnauthorizedException('Current password is incorrect.');
    user.setPassword(newPassword);
    await this.userRepository.save(user);
    this.recordAudit(user, 'PASSWORD_CHANGED', `user:${user.id}`);
    return this.issueTokens(user);
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

      if (!payload.tenantId || !payload.role) {
        throw new Error('Token missing tenant/role');
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
   * Resolve a registered business NUI to tenant id (used by Operations for cross-tenant invoices).
   */
  async resolveTenantIdByNui(nui: string): Promise<string | null> {
    const normalized = nui?.trim().toUpperCase() || '';
    if (!/^8\d{8}$/.test(normalized)) return null;
    const tenant = await this.tenantRepository.findByNui(normalized);
    return tenant?.id ?? null;
  }

  async resolveNuiByTenantId(tenantId: string): Promise<string | null> {
    const tenant = await this.tenantRepository.findById(tenantId);
    return tenant?.nui?.trim() || null;
  }

  /** Company display label for cross-tenant EDI (Operations internal API). */
  async resolveTenantLabelForOperations(tenantId: string): Promise<{ name: string; nui: string | null } | null> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) return null;
    const nui = tenant.nui?.trim() && /^8\d{8}$/.test(tenant.nui.trim()) ? tenant.nui.trim().toUpperCase() : null;
    return { name: tenant.name, nui };
  }

  async getMyProfile(userId: string): Promise<{ fullName: string; email: string } | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) return null;
    return { fullName: user.fullName, email: user.email };
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
  async listTenants(tenantId: string): Promise<Array<{ id: string; name: string; slug: string; nui: string; active: boolean; createdAt: string }>> {
    const tenants = (await this.tenantRepository.list()).filter(t => t.id === tenantId);
    return tenants.map((t) => ({
      id: t.id, name: t.name, slug: t.slug, nui: t.nui, active: t.active, createdAt: t.createdAt,
    }));
  }

  getAuditLog(tenantId: string, limit = 50): AuditEntry[] {
    return this.auditLog.filter(a => a.tenantId === tenantId).slice(0, limit);
  }

  // ── Private helpers ─────────────────────────────────────────

  private issueTokens(user: User): AuthTokens {
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: user.id, email: user.email, tenantId: user.tenantId,
      role: user.role, iat: now, exp: now + this.TOKEN_TTL,
      mustChangePassword: user.mustChangePassword,
    };

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(`${header}.${body}`);
    const accessToken = `${header}.${body}.${signature}`;

    return {
      accessToken,
      expiresIn: this.TOKEN_TTL,
      user: { id: user.id, email: user.email, fullName: user.fullName, tenantId: user.tenantId, role: user.role, mustChangePassword: user.mustChangePassword },
    };
  }

  private sign(data: string): string {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', this.JWT_SECRET).update(data).digest('base64url');
  }

  private generate4DigitCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private async sendCodeEmail(email: string, code: string, purpose: 'account verification' | 'password reset'): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'no-reply@guri.local';

    if (!smtpHost || !smtpUser || !smtpPass) {
      // Dev fallback
      console.log(`[IAM] ${purpose} code for ${email}: ${code}`);
      return;
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: purpose === 'password reset' ? 'Your Guri password reset code' : 'Your Guri verification code',
      text: `Your ${purpose} code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your ${purpose} code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
    });
  }

  private async sendInvitationEmail(email: string, temporaryPassword: string, companyName: string, invitedBy: string, role: UserRole): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || '587');
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'no-reply@guri.local';

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.log(`[IAM] invite email -> ${email} | company=${companyName} | role=${role} | tempPassword=${temporaryPassword}`);
      return;
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: `You are invited to ${companyName} on Guri Finance`,
      text: `Hello,\n\n${invitedBy} invited you to join ${companyName} as ${role}.\nTemporary password: ${temporaryPassword}\n\nPlease login and change your password immediately.`,
      html: `<p>Hello,</p><p><strong>${invitedBy}</strong> invited you to join <strong>${companyName}</strong> as <strong>${role}</strong>.</p><p>Temporary password: <strong>${temporaryPassword}</strong></p><p>Please login and change your password immediately.</p>`,
    });
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
