import { Module } from '@nestjs/common';
import { PortalsController } from './portals.controller';
import { PortalsService } from './portals.service';
import { StudentInsightsController } from './student-insights.controller';
import { StudentInsightsService } from './student-insights.service';
import { DashboardInsightsController } from './dashboard-insights.controller';
import { DashboardInsightsService } from './dashboard-insights.service';
import { CohortInsightsController } from './cohort-insights.controller';
import { CohortInsightsService } from './cohort-insights.service';
import { StudentLibraryService } from './student-library.service';
import { PeopleController } from './people.controller';
import { StudentCalendarService } from './student-calendar.service';
import { AdminTeachersService } from './admin-teachers.service';
import { StudentProgressService } from './student-progress.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [WordPressModule, MailModule, AuditModule],
  controllers: [PortalsController, StudentInsightsController, DashboardInsightsController, CohortInsightsController, PeopleController],
  providers: [PortalsService, StudentInsightsService, DashboardInsightsService, CohortInsightsService, StudentLibraryService, StudentCalendarService, AdminTeachersService, StudentProgressService],
})
export class PortalsModule {}
