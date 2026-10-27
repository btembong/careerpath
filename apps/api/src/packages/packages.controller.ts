import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PackagesService } from './packages.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';

@ApiTags('packages')
@Controller()
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  // ── Public / Student ─────────────────────────────────────

  @Get('packages')
  @ApiOperation({ summary: 'List all published packages (student pricing screen)' })
  findPublished() {
    return this.packagesService.findPublished();
  }

  // ── Admin ────────────────────────────────────────────────

  @Get('admin/packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all packages (draft + published)' })
  findAll() {
    return this.packagesService.findAll();
  }

  @Post('admin/packages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Create a new package (starts as draft)' })
  create(@Body() dto: CreatePackageDto) {
    return this.packagesService.create(dto);
  }

  @Patch('admin/packages/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Admin] Edit or publish/unpublish a package. Publishing is blocked if any course is unreviewed.',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packagesService.update(id, dto);
  }

  @Get('admin/packages/:id/sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Purchase count and revenue for one package' })
  getSales(@Param('id') id: string) {
    return this.packagesService.getSales(id);
  }
}
