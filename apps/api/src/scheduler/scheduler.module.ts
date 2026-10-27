import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WordPressModule } from '../wordpress/wordpress.module';

@Module({
  imports: [PrismaModule, MailModule, WordPressModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
