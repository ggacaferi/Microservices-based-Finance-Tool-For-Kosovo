import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');
  const port = process.env.PORT || 3004;
  await app.listen(port);
  console.log(`✅ Ledger Service running on port ${port}`);
  console.log(`   AI Service: ${process.env.AI_SERVICE_URL || 'http://ai:3005'}`);
}
bootstrap();
