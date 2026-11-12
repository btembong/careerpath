import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { LiveInsightsController } from './live-insights.controller';
import { LiveInsightsService } from './live-insights.service';
import { WhiteboardGateway } from './whiteboard.gateway';
import { DailyModule } from './daily/daily.module';
import { MailModule } from '../mail/mail.module';
import { ClassToolsController } from './class-tools.controller';
import { ClassToolsService } from './class-tools.service';
import { TestCentreModule } from '../test-centre/test-centre.module';
import { AuditModule } from '../audit/audit.module';
import { CohortPayController } from './cohort-pay.controller';
import { CohortPayService } from './cohort-pay.service';

@Module({
  imports: [
    DailyModule,
    MailModule,
    TestCentreModule,
    AuditModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [LiveController, LiveInsightsController, ClassToolsController, CohortPayController],
  providers: [LiveService, LiveInsightsService, WhiteboardGateway, ClassToolsService, CohortPayService],
  exports: [WhiteboardGateway],
})
export class LiveModule {}
