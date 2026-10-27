import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  list(@Req() req: any) { return this.alertsService.listAlerts(req.user.id); }

  @Post()
  upsert(@Req() req: any, @Body() body: any) { return this.alertsService.upsertAlert(req.user.id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.alertsService.deleteAlert(id); }

  @Get('at-risk/:cohortId')
  atRisk(@Param('cohortId') cohortId: string) { return this.alertsService.getAtRiskStudents(cohortId); }

  @Post('check-certificates')
  checkCerts(@Body() body: { studentId: string; courseId: string }) {
    return this.alertsService.checkCertificates(body.studentId, body.courseId);
  }
}
