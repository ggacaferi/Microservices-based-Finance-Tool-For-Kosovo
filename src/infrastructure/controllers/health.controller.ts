import { Controller, Get } from '@nestjs/common';
import { Public } from '../../iam/guards/auth.guard';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
