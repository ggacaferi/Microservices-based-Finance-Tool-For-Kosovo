import { v4 as uuidv4 } from 'uuid';

export type UserRole = 'admin' | 'accountant' | 'data_clerk' | 'auditor';

export interface CreateUserProps {
  email: string;
  password: string;
  fullName: string;
  tenantId: string;
  role?: UserRole;
  mustChangePassword?: boolean;
}

export class User {
  readonly id: string;
  private _email: string;
  readonly tenantId: string;
  private _fullName: string;
  readonly role: UserRole;
  readonly createdAt: string;

  private _passwordHash: string;
  private _active: boolean;
  private _mustChangePassword: boolean;

  private constructor(
    id: string,
    email: string,
    passwordHash: string,
    fullName: string,
    tenantId: string,
    role: UserRole,
    active: boolean,
    mustChangePassword: boolean,
    createdAt: string,
  ) {
    this.id = id;
    this._email = email;
    this._passwordHash = passwordHash;
    this._fullName = fullName;
    this.tenantId = tenantId;
    this.role = role;
    this._active = active;
    this._mustChangePassword = mustChangePassword;
    this.createdAt = createdAt;
  }

  static create(props: CreateUserProps): User {
    if (!props.email || !props.email.includes('@')) {
      throw new Error('A valid email is required.');
    }
    if (!props.password || props.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    if (!props.fullName || !props.fullName.trim()) {
      throw new Error('Full name is required.');
    }
    if (!props.tenantId || !props.tenantId.trim()) {
      throw new Error('Tenant ID is required.');
    }

    // Simple hash for demo (in production: bcrypt/argon2)
    const hash = Buffer.from(props.password).toString('base64');

    return new User(
      uuidv4(),
      props.email.toLowerCase().trim(),
      hash,
      props.fullName.trim(),
      props.tenantId.trim(),
      props.role ?? 'data_clerk',
      true,
      props.mustChangePassword ?? false,
      new Date().toISOString(),
    );
  }

  static rehydrate(
    id: string,
    email: string,
    passwordHash: string,
    fullName: string,
    tenantId: string,
    role: UserRole,
    active: boolean,
    mustChangePassword: boolean,
    createdAt: string,
  ): User {
    return new User(id, email, passwordHash, fullName, tenantId, role, active, mustChangePassword, createdAt);
  }

  get passwordHash(): string {
    return this._passwordHash;
  }

  get email(): string {
    return this._email;
  }

  get fullName(): string {
    return this._fullName;
  }

  get active(): boolean {
    return this._active;
  }

  get mustChangePassword(): boolean {
    return this._mustChangePassword;
  }

  verifyPassword(plaintext: string): boolean {
    const hash = Buffer.from(plaintext).toString('base64');
    return this._passwordHash === hash;
  }

  setPassword(newPassword: string): void {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }
    this._passwordHash = Buffer.from(newPassword).toString('base64');
    this._mustChangePassword = false;
  }

  updateProfile(input: { fullName?: string; email?: string }): void {
    if (input.fullName !== undefined) {
      const n = input.fullName.trim();
      if (!n) throw new Error('Full name is required.');
      this._fullName = n;
    }
    if (input.email !== undefined) {
      const e = input.email.toLowerCase().trim();
      if (!e.includes('@')) throw new Error('A valid email is required.');
      this._email = e;
    }
  }

  deactivate(): void {
    this._active = false;
  }

  hasPermission(requiredRole: UserRole): boolean {
    const hierarchy: Record<UserRole, number> = {
      admin: 40,
      accountant: 30,
      data_clerk: 25,
      auditor: 20,
    };
    return hierarchy[this.role] >= hierarchy[requiredRole];
  }
}
