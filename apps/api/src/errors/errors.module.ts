import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { ErrorsController } from './errors.controller';
import { ErrorsService } from './errors.service';
import { RecordErrorsFilter } from './errors.filter';

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (c: ConfigService) => ({ secret: c.getOrThrow<string>('JWT_SECRET') }) }),
  ],
  controllers: [ErrorsController],
  providers: [ErrorsService, { provide: APP_FILTER, useClass: RecordErrorsFilter }],
})
export class ErrorsModule {}
