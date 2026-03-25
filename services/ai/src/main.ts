import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');
  const http = app.getHttpAdapter().getInstance();
  http.get('/', (_req: any, res: any) =>
    res.json({ service: 'ai', status: 'ok', apiBase: '/api/v1' }),
  );
  http.get('/health', (_req: any, res: any) =>
    res.json({ service: 'ai', status: 'ok' }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT || 3005;
  await app.listen(port);
  console.log(`✅ AI Service running on port ${port}`);
}
bootstrap();
