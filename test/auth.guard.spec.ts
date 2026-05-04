import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantGuard,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from '../src/iam/guards/auth.guard';
import { AuthService } from '../src/iam/application/auth.service';
import { UserRepository } from '../src/iam/infrastructure/user.repository';
import { TenantRepository } from '../src/iam/infrastructure/tenant.repository';

describe('IAM guards', () => {
  const makeCtx = (req: any): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req }),
    }) as ExecutionContext;

  it('JwtAuthGuard allows public routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === IS_PUBLIC_KEY ? true : undefined,
      ),
    };
    const auth = { verifyToken: jest.fn() } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth, reflector as unknown as Reflector);
    expect(guard.canActivate(makeCtx({ headers: {} }))).toBe(true);
    expect(auth.verifyToken).not.toHaveBeenCalled();
  });

  it('JwtAuthGuard rejects missing bearer', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const auth = { verifyToken: jest.fn() } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth, reflector as unknown as Reflector);
    expect(() => guard.canActivate(makeCtx({ headers: {} }))).toThrow(
      /Missing or malformed Authorization header/,
    );
  });

  it('JwtAuthGuard accepts valid bearer from AuthService', async () => {
    const auth = new AuthService(new UserRepository(), new TenantRepository());
    const { accessToken } = await auth.registerTenant(
      `Co-${Date.now()}`,
      `user-${Date.now()}@example.com`,
      'secret12',
      'Owner',
    );
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new JwtAuthGuard(auth, reflector as unknown as Reflector);
    const ok = guard.canActivate(
      makeCtx({ headers: { authorization: `Bearer ${accessToken}` } }),
    );
    expect(ok).toBe(true);
  });

  it('RolesGuard allows when no roles metadata', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(guard.canActivate(makeCtx({}))).toBe(true);
  });

  it('RolesGuard rejects missing user', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? ['admin'] : undefined,
      ),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() => guard.canActivate(makeCtx({ user: undefined }))).toThrow(
      /Authentication required/,
    );
  });

  it('RolesGuard rejects insufficient role', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ROLES_KEY ? ['admin'] : undefined,
      ),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);
    expect(() =>
      guard.canActivate(
        makeCtx({
          user: {
            sub: '1',
            email: 'a@b.com',
            tenantId: 't',
            role: 'viewer',
            iat: 1,
            exp: 9,
          },
        }),
      ),
    ).toThrow(/Insufficient permissions/);
  });

  it('TenantGuard allows when no user', () => {
    const guard = new TenantGuard();
    expect(guard.canActivate(makeCtx({}))).toBe(true);
  });

  it('TenantGuard blocks cross-tenant param', () => {
    const guard = new TenantGuard();
    expect(() =>
      guard.canActivate(
        makeCtx({
          user: {
            sub: '1',
            email: 'a@b.com',
            tenantId: 't1',
            role: 'admin',
            iat: 1,
            exp: 9,
          },
          params: { tenantId: 'other' },
        }),
      ),
    ).toThrow(/Cross-tenant access denied/);
  });
});
