import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

/** Anyone who knows a default secret can sign their own admin token — refuse to run with one in production. */
function assertProductionSecrets() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET ?? '';
  if (secret.length < 32 || /change_?me|changeme|secret/i.test(secret)) {
    throw new Error('JWT_SECRET must be a random value of at least 32 characters in production.');
  }
}

async function bootstrap() {
  assertProductionSecrets();
  // rawBody: true is required for Paystack + Tranzak webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const allowedOrigins = (process.env.PORTAL_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .concat(['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('CareerPath Africa API')
    .setDescription('API gateway for the CareerPath Africa portal')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
