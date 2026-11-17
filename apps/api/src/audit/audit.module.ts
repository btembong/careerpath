import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';

/** The activity log: available everywhere, so any feature can record a change */
@Global()
@Module({
  controllers: [ActivityController],
  providers: [AuditService, AuditInterceptor, ActivityService],
  exports: [AuditService, AuditInterceptor, ActivityService],
})
export class AuditModule {}
