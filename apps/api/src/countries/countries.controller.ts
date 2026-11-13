import { BadRequestException, Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
import { RepInsightsService } from './rep-insights.service';
import { InsightsService } from '../reports/insights.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService, private readonly rep: RepInsightsService, private readonly insights: InsightsService) {}

  /** Public — used by registration page to populate country selector */
  @Get()
  @ApiOperation({ summary: '[Public] List active countries for registration' })
  listPublic() {
    return this.countriesService.listPublic();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('admin/countries')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all countries with commission settings' })
  findAll() {
    return this.countriesService.findAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('admin/countries')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Add a country of operation' })
  create(@Body() dto: CreateCountryDto) {
    return this.countriesService.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('admin/countries/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Set commission %, per-student bonus, or assign/reassign the rep' })
  update(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.countriesService.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/dashboard')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: "[Country Rep] Own country's revenue, active students, and wallet" })
  getRepDashboard(@CurrentUser() user: UserProfile) {
    return this.countriesService.getRepDashboard(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/insights')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: '[Country Rep] Your country: people, sales by month, best sellers, teachers, newest students and your earnings' })
  repInsights(@CurrentUser() user: UserProfile, @Query('period') period?: string) {
    if (!user.countryId) throw new BadRequestException('You are not assigned to a country yet');
    return this.insights.country(user.countryId, period, { repId: user.id });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/overview')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: '[Country Rep] Sales, students, weekly trend, best sellers and earnings for a period' })
  repOverview(@CurrentUser() user: UserProfile, @Query('range') range?: string) {
    return this.rep.overview(user, range);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/packages')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: '[Country Rep] Packages and single courses on sale, and how they sell in my country' })
  repPackages(@CurrentUser() user: UserProfile) {
    return this.rep.packages(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/teachers')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: '[Country Rep] Teachers in my country, including applications' })
  repTeachers(@CurrentUser() user: UserProfile) {
    return this.rep.teachers(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('country-rep/students')
  @Roles(UserRole.COUNTRY_REP)
  @ApiOperation({ summary: '[Country Rep] Students in my country: what they bought, progress and when access ends' })
  repStudents(@CurrentUser() user: UserProfile) {
    return this.rep.students(user);
  }
}
