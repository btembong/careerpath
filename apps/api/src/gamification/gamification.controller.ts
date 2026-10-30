import { Body, Controller, Get, Param, Patch, Query, UseGuards, Req } from '@nestjs/common';
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

  @Get('board')
  board(@Req() req: any, @Query('period') period?: string, @Query('scope') scope?: string, @Query('cohortId') cohortId?: string) {
    return this.gamificationService.getBoard(req.user, { period, scope, cohortId });
  }

  @Patch('visibility')
  visibility(@Req() req: any, @Body('visible') visible: boolean) {
    return this.gamificationService.setLeaderboardVisible(req.user.id, visible);
  }

  @Get('leaderboard/:cohortId')
  leaderboard(@Req() req: any, @Param('cohortId') cohortId: string) {
    return this.gamificationService.getCohortLeaderboard(cohortId, req.user);
  }
}
