import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`✅ Operations Service running on port ${port}`);
  console.log(`   Compliance Service: ${process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002'}`);
  console.log(`   Ledger Service:     ${process.env.LEDGER_SERVICE_URL     || 'http://ledger:3004'}`);
}
bootstrap();
