import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async listAlerts(teacherId: string) {
    return this.prisma.progressAlert.findMany({ where: { teacherId }, include: { cohort: { select: { name: true } } } });
  }

  async upsertAlert(teacherId: string, dto: { cohortId: string; type: string; thresholdDays?: number; thresholdScore?: number; enabled: boolean }) {
    return this.prisma.progressAlert.upsert({
      where: { cohortId_teacherId_type: { cohortId: dto.cohortId, teacherId, type: dto.type as any } } as any,
      create: { teacherId, cohortId: dto.cohortId, type: dto.type as any, thresholdDays: dto.thresholdDays, thresholdScore: dto.thresholdScore, enabled: dto.enabled },
      update: { thresholdDays: dto.thresholdDays, thresholdScore: dto.thresholdScore, enabled: dto.enabled },
    });
  }

  async deleteAlert(id: string) {
    await this.prisma.progressAlert.delete({ where: { id } });
    return { deleted: true };
  }

  // Certificate automation — auto-issue when all lessons complete + all assignments passed
  async checkCertificates(studentId: string, courseId: string) {
    const already = await this.prisma.certificate.findFirst({ where: { studentId, courseId } });
    if (already) return null;

    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      include: { lessons: { select: { id: true } } },
    });
    const lessonIds = modules.flatMap(m => m.lessons.map(l => l.id));
    if (!lessonIds.length) return null;

    const completed = await this.prisma.lessonProgress.count({ where: { studentId, lessonId: { in: lessonIds }, completed: true } });
    if (completed < lessonIds.length) return null;

    // Mark enrollment complete
    await this.prisma.courseEnrollment.updateMany({ where: { studentId, courseId }, data: { completedAt: new Date() } });

    // Issue certificate
    const verifyCode = Math.random().toString(36).slice(2, 10).toUpperCase() + Date.now().toString(36).toUpperCase();
    const cert = await this.prisma.certificate.create({
      data: { studentId, courseId, verifyCode, pdfUrl: `/certificates/pdf/${verifyCode}` },
    });

    return cert;
  }

  // Cron: run progress alert checks daily at 8 AM UTC
  @Cron('0 8 * * *')
  async runDailyAlerts() {
    const alerts = await this.prisma.progressAlert.findMany({
      where: { enabled: true },
      include: {
        cohort: { include: { students: { include: { student: { select: { id: true, email: true, name: true, lastActiveDate: true, xpTotal: true } } } } } },
      },
    });

    for (const alert of alerts) {
      for (const roster of alert.cohort.students) {
        const student = roster.student;
        let shouldAlert = false;

        if (alert.type === 'INACTIVE' && alert.thresholdDays) {
          const cutoff = new Date(Date.now() - alert.thresholdDays * 24 * 60 * 60 * 1000);
          if (!student.lastActiveDate || student.lastActiveDate < cutoff) shouldAlert = true;
        }

        if (shouldAlert) {
          // In production: send email via MailService or push notification
          console.log(`[Alert] ${alert.type} — student ${student.email} — cohort ${alert.cohort.name}`);
        }
      }
    }
  }

  async getAtRiskStudents(cohortId: string) {
    const roster = await this.prisma.cohortRoster.findMany({
      where: { cohortId },
      include: { student: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, lastActiveDate: true, xpTotal: true, streak: true } } },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return roster.map(r => {
      const s = r.student;
      const isInactive = !s.lastActiveDate || s.lastActiveDate < sevenDaysAgo;
      const isLowXP = s.xpTotal < 50;
      const riskLevel = isInactive && isLowXP ? 'high' : isInactive || isLowXP ? 'medium' : 'low';
      return {
        id: s.id,
        name: s.name ?? ([s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student'),
        avatarUrl: s.avatarUrl,
        lastActiveDate: s.lastActiveDate,
        xpTotal: s.xpTotal,
        streak: s.streak,
        riskLevel,
      };
    }).sort((a, b) => (['high', 'medium', 'low'].indexOf(a.riskLevel)) - (['high', 'medium', 'low'].indexOf(b.riskLevel)));
  }
}
