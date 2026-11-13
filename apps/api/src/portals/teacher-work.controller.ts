import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TeacherWorkService } from './teacher-work.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals/teacher/work')
export class TeacherWorkController {
  constructor(private readonly work: TeacherWorkService) {}

  @Get(':section')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] The top of a working page: courses, mentorship, bank, recordings or quizzes' })
  get(@CurrentUser() user: UserProfile, @Param('section') section: string) { return this.work.get(user, section); }
}
