import { Module } from '@nestjs/common';
import { CourseAdminController } from './course-admin.controller';
import { CourseManageService } from './course-manage.service';
import { WpPullService } from './wp-pull.service';
import { TaxonomyService } from './taxonomy.service';
import { TutorImportService } from './tutor-import.service';
import { TutorClient } from './tutor-client';
import { WordPressModule } from '../wordpress/wordpress.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WordPressModule, NotificationsModule],
  controllers: [CourseAdminController],
  providers: [CourseManageService, WpPullService, TaxonomyService, TutorClient, TutorImportService],
})
export class CourseAdminModule {}
