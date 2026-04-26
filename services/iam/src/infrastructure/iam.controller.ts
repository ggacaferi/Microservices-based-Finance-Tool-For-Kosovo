import { Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { RegisterTenantDto, LoginDto, CreateUserDto, VerifyRegistrationDto, RequestPasswordResetDto, VerifyPasswordResetDto, ChangePasswordDto, UpdateBusinessDto, UpdateProfileDto } from '../application/dto/auth.dto';
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
    return this.authService.requestRegistrationCode(dto.tenantName, dto.nui, dto.email, dto.password, dto.fullName);
  }

  @Public()
  @Post('register/request-code')
  requestCode(@Body() dto: RegisterTenantDto) {
    return this.authService.requestRegistrationCode(dto.tenantName, dto.nui, dto.email, dto.password, dto.fullName);
  }

  @Public()
  @Post('register/verify-code')
  verifyCode(@Body() dto: VerifyRegistrationDto) {
    return this.authService.verifyRegistrationCode(dto.email, dto.code);
  }

  @Public()
  @Post('forgot-password/request-code')
  forgotPasswordRequest(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordResetCode(dto.email);
  }

  @Public()
  @Post('forgot-password/verify-code')
  forgotPasswordVerify(@Body() dto: VerifyPasswordResetDto) {
    return this.authService.verifyPasswordResetCode(dto.email, dto.code, dto.newPassword);
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

  @Post('change-password')
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.sub, dto.currentPassword, dto.newPassword);
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
  listTenants(@Req() req: any) {
    return this.authService.listTenants(req.user.tenantId);
  }

  /**
   * GET /api/v1/iam/me — Return current user profile, including fullName and tenant NUI
   */
  @Get('me')
  async me(@Req() req: any) {
    const [profile, nui] = await Promise.all([
      this.authService.getMyProfile(req.user.sub),
      this.authService.resolveNuiByTenantId(req.user.tenantId),
    ]);
    return {
      id: req.user.sub,
      email: profile?.email ?? req.user.email,
      fullName: profile?.fullName ?? '',
      tenantId: req.user.tenantId,
      role: req.user.role,
      mustChangePassword: req.user.mustChangePassword,
      nui: nui ?? null,
    };
  }

  @Patch('me')
  updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.authService.updateMyProfile(req.user.sub, dto);
  }

  @Patch('business')
  @Roles('admin')
  updateBusiness(@Req() req: any, @Body() dto: UpdateBusinessDto) {
    return this.authService.updateBusinessProfile(req.user.sub, dto);
  }

  /**
   * GET /api/v1/iam/internal/tenant-by-nui/:nui — Service-to-service: map business NUI → tenant id.
   * Requires header x-operations-secret matching IAM_OPS_SHARED_SECRET.
   */
  @Public()
  @Get('internal/tenant-by-nui/:nui')
  async tenantByNui(@Param('nui') nui: string, @Headers('x-operations-secret') secret?: string) {
    const fromEnv = process.env.IAM_OPS_SHARED_SECRET?.trim();
    const expected =
      fromEnv || (process.env.NODE_ENV !== 'production' ? 'guri-internal-nui-lookup' : '');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid or missing service authentication.');
    }
    const tenantId = await this.authService.resolveTenantIdByNui(decodeURIComponent(nui));
    if (!tenantId) throw new NotFoundException('No tenant registered for this NUI.');
    return { tenantId };
  }

  /**
   * GET /api/v1/iam/internal/tenant-nui-by-id/:tenantId — Service-to-service: map tenant id → NUI.
   * Requires header x-operations-secret matching IAM_OPS_SHARED_SECRET.
   */
  @Public()
  @Get('internal/tenant-nui-by-id/:tenantId')
  async tenantNuiById(@Param('tenantId') tenantId: string, @Headers('x-operations-secret') secret?: string) {
    const fromEnv = process.env.IAM_OPS_SHARED_SECRET?.trim();
    const expected =
      fromEnv || (process.env.NODE_ENV !== 'production' ? 'guri-internal-nui-lookup' : '');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid or missing service authentication.');
    }
    const nui = await this.authService.resolveNuiByTenantId(decodeURIComponent(tenantId));
    return { nui: nui ?? null };
  }

  /**
   * GET /api/v1/iam/internal/tenant-label/:tenantId — Service-to-service: company name + NUI for EDI display.
   */
  @Public()
  @Get('internal/tenant-label/:tenantId')
  async tenantLabel(@Param('tenantId') tenantId: string, @Headers('x-operations-secret') secret?: string) {
    const fromEnv = process.env.IAM_OPS_SHARED_SECRET?.trim();
    const expected =
      fromEnv || (process.env.NODE_ENV !== 'production' ? 'guri-internal-nui-lookup' : '');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Invalid or missing service authentication.');
    }
    const label = await this.authService.resolveTenantLabelForOperations(decodeURIComponent(tenantId));
    if (!label) throw new NotFoundException('Tenant not found.');
    return label;
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
  audit(@Req() req: any, @Query('limit') limit?: string) {
    return this.authService.getAuditLog(req.user.tenantId, limit ? Number(limit) : 50);
  }
}
