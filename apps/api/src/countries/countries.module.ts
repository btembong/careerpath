import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';
import { RepInsightsService } from './rep-insights.service';
import { InsightsService } from '../reports/insights.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [CountriesController],
  providers: [CountriesService, RepInsightsService, InsightsService],
})
export class CountriesModule {}
