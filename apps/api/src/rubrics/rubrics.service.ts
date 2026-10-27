import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RubricsService {
  constructor(private prisma: PrismaService) {}

  async createRubric(assignmentId: string, criteria: { title: string; weight: number; descriptors: any }[]) {
    return this.prisma.assignmentRubric.create({
      data: {
        assignmentId,
        criteria: { create: criteria.map(c => ({ title: c.title, weight: c.weight, descriptors: c.descriptors })) },
      },
      include: { criteria: true },
    });
  }

  async getRubric(assignmentId: string) {
    return this.prisma.assignmentRubric.findUnique({
      where: { assignmentId },
      include: { criteria: true },
    });
  }

  async gradeWithRubric(submissionId: string, graderId: string, scores: { criterionId: string; score: number; comment?: string }[]) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { rubric: { include: { criteria: true } } } } },
    });
    if (!submission?.assignment.rubric) throw new NotFoundException('Rubric not found for this assignment');

    await this.prisma.rubricScore.createMany({
      data: scores.map(s => ({ submissionId, criterionId: s.criterionId, graderId, score: s.score, comment: s.comment })),
      skipDuplicates: true,
    });

    // Compute weighted final grade: sum(score/4 * weight)
    const criteria = submission.assignment.rubric.criteria;
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    const finalPct = scores.reduce((sum, s) => {
      const c = criteria.find(cr => cr.id === s.criterionId);
      return sum + (c ? (s.score / 4) * (c.weight / totalWeight) : 0);
    }, 0);

    const grade = Math.round(finalPct * submission.assignment.maxPoints);
    await this.prisma.submission.update({ where: { id: submissionId }, data: { grade, status: 'GRADED' } });

    return { grade, percentage: Math.round(finalPct * 100) };
  }

  async getSubmissionScores(submissionId: string) {
    return this.prisma.rubricScore.findMany({
      where: { submissionId },
      include: { criterion: true },
    });
  }

  // ── Peer Review ───────────────────────────────────────────
  async assignPeerReviews(assignmentId: string) {
    const submissions = await this.prisma.submission.findMany({ where: { assignmentId } });
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const reviewCount = assignment.peerReviewCount;
    const pairs: { reviewerId: string; submissionId: string }[] = [];

    for (const sub of submissions) {
      const others = submissions.filter(s => s.studentId !== sub.studentId);
      const toReview = this.shuffle(others).slice(0, reviewCount);
      for (const target of toReview) {
        pairs.push({ reviewerId: sub.studentId, submissionId: target.id });
      }
    }

    await this.prisma.peerReview.createMany({ data: pairs.map(p => ({ ...p, assignmentId })), skipDuplicates: true });
    return { assigned: pairs.length };
  }

  async submitPeerReview(reviewId: string, reviewerId: string, dto: { grade: number; feedback: string }) {
    return this.prisma.peerReview.update({
      where: { id: reviewId },
      data: { grade: dto.grade, feedback: dto.feedback, status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async getMyPeerReviews(reviewerId: string) {
    return this.prisma.peerReview.findMany({
      where: { reviewerId },
      include: { submission: { include: { assignment: { select: { title: true } } } } },
    });
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
}
