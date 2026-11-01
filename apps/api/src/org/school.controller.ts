import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SchoolService } from './school.service';

@ApiTags('schools')
@Controller('org')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  // ── CareerPath admin ─────────────────────────────────────

  @Get('admin/organisations')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Schools and companies with their packages, seats and admins' })
  adminList() { return this.school.adminList(); }

  @Post('admin/organisations')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Set up a school: its admin (emailed a sign-in link), a package and seats' })
  adminCreate(@Body() body: Parameters<SchoolService['adminCreate']>[0]) { return this.school.adminCreate(body ?? ({} as any)); }

  @Post('admin/organisations/:id/packages')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Seats on another package, or more seats on one the school has' })
  adminAddPackage(@Param('id') id: string, @Body() body: { packageId: string; seats: number; pricePerSeat?: number | null }) { return this.school.adminAddPackage(id, body ?? ({} as any)); }

  // ── School portal ────────────────────────────────────────

  @Get('school')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[School] Seats per package, how students are doing, who needs a nudge' })
  dashboard(@CurrentUser() user: UserProfile) { return this.school.dashboard(user); }

  @Get('school/students')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[School] Everyone invited or joined, with progress' })
  students(@CurrentUser() user: UserProfile) { return this.school.students(user); }

  @Post('school/invite')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[School] Invite students by email to one of the school’s packages' })
  invite(@CurrentUser() user: UserProfile, @Body() body: { enrollmentId: string; emails: string[] }) { return this.school.invite(user, body?.enrollmentId, body?.emails ?? []); }

  @Post('school/seats/:id/remind')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  remind(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.school.remind(user, id); }

  @Delete('school/seats/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[School] Remove an invite nobody accepted, freeing the seat' })
  remove(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.school.remove(user, id); }

  @Patch('school/settings')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ORG_ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[School] Turn the join link on or off, change the allowed email domain, or make a new link' })
  settings(@CurrentUser() user: UserProfile, @Body() body: { joinEnabled?: boolean; emailDomain?: string | null; newCode?: boolean }) { return this.school.settings(user, body ?? {}); }

  // ── Students and the public join link ────────────────────

  @Get('join/:code')
  @ApiOperation({ summary: 'Public: which school a join link is for, and whether it has seats' })
  linkInfo(@Param('code') code: string) { return this.school.linkInfo(code); }

  @Post('join/:code')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.STUDENT) @ApiBearerAuth()
  @ApiOperation({ summary: '[Student] Take a free seat with a school’s join link' })
  join(@CurrentUser() user: UserProfile, @Param('code') code: string) { return this.school.joinWithLink(user, code); }
}
