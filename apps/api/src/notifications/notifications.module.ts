import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PresenceService } from './presence.service';

/** Global so payments, education, certificates and the scheduler can notify without import churn. */
@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, PresenceService],
  exports: [NotificationsService, PushService, PresenceService],
})
export class NotificationsModule {}
