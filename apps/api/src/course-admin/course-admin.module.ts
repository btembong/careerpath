import { Module } from '@nestjs/common';
import { CourseAdminController } from './course-admin.controller';
import { CourseManageService } from './course-manage.service';
import { WpPullService } from './wp-pull.service';
import { TaxonomyService } from './taxonomy.service';
import { TutorImportService } from './tutor-import.service';
import { TutorClient } from './tutor-client';
import { CommissionsService } from './commissions.service';
import { TeacherCoursesService } from './teacher-courses.service';
import { AuditModule } from '../audit/audit.module';
import { WordPressModule } from '../wordpress/wordpress.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WordPressModule, NotificationsModule, AuditModule],
  controllers: [CourseAdminController],
  providers: [CourseManageService, WpPullService, TaxonomyService, TutorClient, TutorImportService, CommissionsService, TeacherCoursesService],
  exports: [TeacherCoursesService],
})
export class CourseAdminModule {}
