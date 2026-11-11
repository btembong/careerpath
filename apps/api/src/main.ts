import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const production = process.env.NODE_ENV === 'production';

  // Behind Caddy on the same machine: take the visitor's address from its X-Forwarded-For, so rate limits
  // count each visitor rather than lumping everyone together as the proxy. Only a proxy on this machine is trusted.
  app.set('trust proxy', 'loopback');

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
    .concat(production ? [] : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // The API's own documentation pages: for development only
  if (!production) {
    const config = new DocumentBuilder()
      .setTitle('CareerPath Africa API')
      .setDescription('API gateway for the CareerPath Africa portal')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api/v1`);
  if (!production) console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
