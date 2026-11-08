import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { GroupsService } from './groups.service';
import { MessageActionsService } from './message-actions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    PrismaModule, NotificationsModule, MailModule, FilesModule, ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, GroupsService, MessageActionsService],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
