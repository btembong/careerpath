import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { WhiteboardGateway } from './whiteboard.gateway';
import { DailyModule } from './daily/daily.module';

@Module({
  imports: [
    DailyModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [LiveController],
  providers: [LiveService, WhiteboardGateway],
  exports: [WhiteboardGateway],
})
export class LiveModule {}
