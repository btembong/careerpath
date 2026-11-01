import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { SchoolService } from './school.service';
import { SchoolController } from './school.controller';

@Module({
  imports: [WordPressModule, MailModule],
  controllers: [OrgController, SchoolController],
  providers: [OrgService, SchoolService],
})
export class OrgModule {}
