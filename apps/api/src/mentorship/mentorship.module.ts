import { Module } from '@nestjs/common';
import { MentorshipController } from './mentorship.controller';
import { MentorshipService } from './mentorship.service';
import { DailyModule } from '../live/daily/daily.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [DailyModule, MailModule],
  controllers: [MentorshipController],
  providers: [MentorshipService],
})
export class MentorshipModule {}
