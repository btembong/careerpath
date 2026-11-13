import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsOverviewService } from './reports-overview.service';
import { InsightsService } from './insights.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsOverviewService, InsightsService],
  exports: [InsightsService],
})
export class ReportsModule {}
