import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Global so payments, education, certificates and the scheduler can notify without import churn. */
@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
