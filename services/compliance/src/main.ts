import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');
  const http = app.getHttpAdapter().getInstance();
  http.get('/', (_req: any, res: any) =>
    res.json({ service: 'compliance', status: 'ok', apiBase: '/api/v1' }),
  );
  http.get('/health', (_req: any, res: any) =>
    res.json({ service: 'compliance', status: 'ok' }),
  );
  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`✅ Compliance Service running on port ${port}`);
}
bootstrap();
