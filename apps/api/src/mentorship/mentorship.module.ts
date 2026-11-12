import { Module } from '@nestjs/common';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';
import { MentorPayController } from './mentor-pay.controller';
import { MentorPayService } from './mentor-pay.service';
import { DailyModule } from '../live/daily/daily.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [DailyModule, MailModule, AuditModule],
  controllers: [MentorshipController, MentorPayController],
  providers: [MentorshipService, MentorPayService],
})
export class MentorshipModule {}
