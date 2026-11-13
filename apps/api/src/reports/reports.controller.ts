import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportsOverviewService } from './reports-overview.service';
import { InsightsService } from './insights.service';
import { UpsertExchangeRateDto } from './dto/upsert-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService, private readonly overviewService: ReportsOverviewService, private readonly insights: InsightsService) {}

  @Get('admin/insights')
  @ApiOperation({ summary: '[Admin] How the platform is doing: people, activity, sign-ups, journeys, learning, and the map by country (days = 7, 30 or 365)' })
  insightsOverview(@Query('days') days?: string) {
    return this.insights.overview(days);
  }

  @Get('admin/insights/countries')
  @ApiOperation({ summary: '[Admin] Every country side by side for a period (month, last, six)' })
  insightsCountries(@Query('period') period?: string) {
    return this.insights.countries(period);
  }

  @Get('admin/insights/countries/:id')
  @ApiOperation({ summary: '[Admin] One country: people, sales, where the money went, teachers, best sellers, newest students' })
  insightsCountry(@Param('id') id: string, @Query('period') period?: string) {
    return this.insights.country(id, period);
  }

  @Get('admin/reports/overview')
  @ApiOperation({ summary: '[Admin] One month in a chosen currency: totals, sales by day, courses, teachers, countries and purchases' })
  overview(@Query('month') month?: string, @Query('base') base?: string) {
    return this.overviewService.overview(month, base || 'GHS');
  }

  @Get('admin/reports/courses')
  @ApiOperation({
    summary: '[Admin] Revenue per course in USD (even-split across each package\'s courseIds)',
  })
  getCourseRevenue() {
    return this.reportsService.getCourseRevenue();
  }

  @Get('admin/reports/teachers')
  @ApiOperation({ summary: '[Admin] Total earned and paid-out per teacher, USD-normalized' })
  getTeacherRevenue() {
    return this.reportsService.getTeacherRevenue();
  }

  @Get('admin/reports/countries')
  @ApiOperation({
    summary: '[Admin] Revenue per country with % share of total, USD-normalized',
  })
  getCountryRevenue() {
    return this.reportsService.getCountryRevenue();
  }

  @Get('admin/reports/purchases')
  @ApiOperation({ summary: '[Admin] Package and course purchases, optionally filtered by date (YYYY-MM-DD)' })
  getPurchases(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.reportsService.getPurchases(startDate, endDate);
  }

  @Get('admin/reports/exchange-rates')
  @ApiOperation({ summary: '[Admin] List all exchange rates used for USD normalization' })
  getExchangeRates() {
    return this.reportsService.getExchangeRates();
  }

  @Post('admin/reports/exchange-rates')
  @ApiOperation({
    summary: '[Admin] Create or update an exchange rate. Rates are admin-maintained periodically.',
  })
  upsertRate(@Body() dto: UpsertExchangeRateDto) {
    return this.reportsService.upsertExchangeRate(dto.currency, dto.toUsdRate);
  }
}
