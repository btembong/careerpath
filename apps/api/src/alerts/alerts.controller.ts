import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { UserRole } from '@cpa/shared';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@Req() req: any) { return this.alertsService.listAlerts(req.user.id); }

  @Post()
  upsert(@Req() req: any, @Body() body: any) { return this.alertsService.upsertAlert(req.user.id, body); }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) { return this.alertsService.deleteAlert(id, req.user.id); }

  @Get('at-risk/:cohortId')
  atRisk(@Req() req: any, @Param('cohortId') cohortId: string) {
    return this.alertsService.getAtRiskStudents(cohortId, req.user);
  }

  @Post('check-certificates')
  checkCerts(@Req() req: any, @Body() body: { studentId: string; courseId: string }) {
    return this.alertsService.checkCertificates(req.user, body.studentId, body.courseId);
  }
}
