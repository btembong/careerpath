import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me')
  myStats(@Req() req: any) {
    return this.gamificationService.getMyStats(req.user.id);
  }

  @Get('leaderboard/:cohortId')
  leaderboard(@Req() req: any, @Param('cohortId') cohortId: string) {
    return this.gamificationService.getCohortLeaderboard(cohortId, req.user);
  }
}
