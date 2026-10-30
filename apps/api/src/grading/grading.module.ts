import { Module } from '@nestjs/common';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';
import { PlatformCoursesModule } from '../platform-courses/platform-courses.module';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PlatformCoursesModule, GamificationModule, NotificationsModule],
  controllers: [GradingController],
  providers: [GradingService],
})
export class GradingModule {}
