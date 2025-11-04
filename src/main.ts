import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const allowedOrigins =
    configService
      .get<string>('CORS_DOMAINS')
      ?.split(',')
      .map((origin) => origin.trim()) || [];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  new Logger('Expense Tracker').log(
    'Enabled CORS Domains',
    allowedOrigins.join(','),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
