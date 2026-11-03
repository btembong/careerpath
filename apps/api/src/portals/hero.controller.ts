import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { HeroService } from './hero.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portals')
export class HeroController {
  constructor(private readonly hero: HeroService) {}

  @Get('hero')
  @ApiOperation({ summary: 'The top of the dashboard for whoever is signed in: one line about today and their next things' })
  get(@CurrentUser() user: UserProfile) { return this.hero.forUser(user); }
}
