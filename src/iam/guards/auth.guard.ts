import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, JwtPayload } from '../application/auth.service';
import { UserRole } from '../domain/user.entity';

// ── Decorators ────────────────────────────────────────────────

/** Mark a route as publicly accessible (no JWT required) */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Require minimum role for a route */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// ── JWT Auth Guard ────────────────────────────────────────────

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header.');
    }

    const token = authHeader.slice(7);
    const payload: JwtPayload = this.authService.verifyToken(token);

    // Attach user info to request for downstream use
    request.user = payload;
    return true;
  }
}

// ── Role-Based Access Guard ───────────────────────────────────

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator → allow
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    const hierarchy: Record<UserRole, number> = {
      admin: 40,
      accountant: 30,
      auditor: 20,
      viewer: 10,
    };

    const userLevel = hierarchy[user.role] ?? 0;
    const minRequired = Math.min(...requiredRoles.map((r) => hierarchy[r] ?? 99));

    if (userLevel < minRequired) {
      throw new UnauthorizedException(
        `Insufficient permissions. Required: ${requiredRoles.join('/')}, your role: ${user.role}`,
      );
    }

    return true;
  }
}

// ── Tenant Isolation Guard ────────────────────────────────────

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    // Public routes or non-authenticated routes skip
    if (!user) return true;

    // If request has a tenantId param/body, ensure it matches the JWT
    const paramTenantId = request.params?.tenantId;
    const bodyTenantId = request.body?.tenantId;

    if (paramTenantId && paramTenantId !== user.tenantId) {
      throw new UnauthorizedException('Cross-tenant access denied.');
    }
    if (bodyTenantId && bodyTenantId !== user.tenantId) {
      throw new UnauthorizedException('Cross-tenant access denied.');
    }

    return true;
  }
}
