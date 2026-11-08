import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { StaffRoomService } from './staff-room.service';
import { StaffRoomController } from './staff-room.controller';
import { GamificationModule } from '../gamification/gamification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [GamificationModule, NotificationsModule, MessagesModule],
  controllers: [CommunityController, StaffRoomController],
  providers: [CommunityService, StaffRoomService],
})
export class CommunityModule {}
