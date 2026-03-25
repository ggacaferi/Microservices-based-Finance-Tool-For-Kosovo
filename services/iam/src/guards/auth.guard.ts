import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, JwtPayload } from '../application/auth.service';
import { UserRole } from '../domain/user.entity';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService, private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing Authorization header.');

    const payload: JwtPayload = this.authService.verifyToken(authHeader.slice(7));
    request.user = payload;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) throw new UnauthorizedException('Authentication required.');

    const hierarchy: Record<UserRole, number> = { admin: 40, accountant: 30, data_clerk: 25, auditor: 20 };
    const userLevel = hierarchy[user.role] ?? 0;
    const minRequired = Math.min(...requiredRoles.map(r => hierarchy[r] ?? 99));
    if (userLevel < minRequired) throw new UnauthorizedException(`Insufficient permissions. Required: ${requiredRoles.join('/')}, your role: ${user.role}`);
    return true;
  }
}
