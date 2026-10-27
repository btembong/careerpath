import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CountriesService } from './countries.service';
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
  constructor(private readonly countriesService: CountriesService) {}

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
}
