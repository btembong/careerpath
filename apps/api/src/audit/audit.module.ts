import { Global, Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { GeoService } from './geo.service';

/** The activity log: available everywhere, so any feature can record a change */
@Global()
@Module({
  imports: [MailModule],
  controllers: [ActivityController],
  providers: [AuditService, AuditInterceptor, ActivityService, GeoService],
  exports: [AuditService, AuditInterceptor, ActivityService, GeoService],
})
export class AuditModule {}
