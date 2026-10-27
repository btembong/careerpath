import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
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
  constructor(private readonly reportsService: ReportsService) {}

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
