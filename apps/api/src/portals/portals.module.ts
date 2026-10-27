import { Module } from '@nestjs/common';
import { PortalsController } from './portals.controller';
import { PortalsService } from './portals.service';
import { StudentInsightsController } from './student-insights.controller';
import { StudentInsightsService } from './student-insights.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [WordPressModule, MailModule, AuditModule],
  controllers: [PortalsController, StudentInsightsController],
  providers: [PortalsService, StudentInsightsService],
})
export class PortalsModule {}
