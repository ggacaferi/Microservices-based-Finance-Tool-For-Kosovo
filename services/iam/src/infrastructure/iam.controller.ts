import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { RegisterTenantDto, LoginDto, CreateUserDto } from '../application/dto/auth.dto';
import { Public, Roles, JwtAuthGuard, RolesGuard } from '../guards/auth.guard';

@Controller('iam')
export class IamController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/iam/register — Register a new tenant + admin user
   */
  @Public()
  @Post('register')
  register(@Body() dto: RegisterTenantDto) {
    return this.authService.registerTenant(dto.tenantName, dto.email, dto.password, dto.fullName);
  }

  /**
   * POST /api/v1/iam/login — Authenticate and receive JWT
   */
  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * POST /api/v1/iam/users — Create a user within the caller's tenant (admin only)
   */
  @Post('users')
  @Roles('admin')
  createUser(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.authService.createUser(req.user.sub, dto.email, dto.password, dto.fullName, dto.role);
  }

  /**
   * GET /api/v1/iam/users — List users in the caller's tenant
   */
  @Get('users')
  @Roles('accountant')
  listUsers(@Req() req: any) {
    return this.authService.listUsers(req.user.tenantId);
  }

  /**
   * GET /api/v1/iam/tenants — List all tenants (admin only, for platform management)
   */
  @Get('tenants')
  @Roles('admin')
  listTenants() {
    return this.authService.listTenants();
  }

  /**
   * GET /api/v1/iam/me — Return current user from JWT
   */
  @Get('me')
  me(@Req() req: any) {
    return {
      id: req.user.sub,
      email: req.user.email,
      tenantId: req.user.tenantId,
      role: req.user.role,
    };
  }

  /**
   * POST /api/v1/iam/verify — Verify a token (used by API Gateway)
   */
  @Public()
  @Post('verify')
  verify(@Body() body: { token: string }) {
    const payload = this.authService.verifyToken(body.token);
    return { valid: true, payload };
  }

  /**
   * GET /api/v1/iam/audit — View audit log (admin only)
   */
  @Get('audit')
  @Roles('admin')
  audit(@Query('limit') limit?: string) {
    return this.authService.getAuditLog(limit ? Number(limit) : 50);
  }
}
