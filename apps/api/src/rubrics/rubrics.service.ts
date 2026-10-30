import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EducationService } from '../education/education.service';

/**
 * A criterion is worth `weight` marks; `descriptors` are its levels, lowest first:
 * [{ points, label }] with points between 0 and weight. The assignment grade is the
 * rubric total scaled to the assignment's maxPoints.
 */
export interface RubricLevel { points: number; label: string }
export interface CriterionInput { id?: string; title: string; weight: number; descriptors: RubricLevel[] }

/** Starting points teachers can load and then edit. Level points are fractions of the criterion's marks. */
export const RUBRIC_TEMPLATES = [
  {
    key: 'worked', name: 'Worked problems', hint: 'Maths and science worksheets',
    criteria: [
      { title: 'Correct method', share: 0.4, levels: ['No method', 'Started', 'Small slip', 'All correct'] },
      { title: 'Accurate answers', share: 0.4, levels: ['None right', 'A few', 'Most', 'All'] },
      { title: 'Working shown', share: 0.2, levels: ['Answers only', 'Some steps', 'Most steps', 'Every step'] },
    ],
  },
  {
    key: 'essay', name: 'Essay', hint: 'English, history, social studies',
    criteria: [
      { title: 'Answers the question', share: 0.3, levels: ['Off topic', 'Partly', 'Mostly', 'Fully'] },
      { title: 'Evidence and examples', share: 0.3, levels: ['None', 'Thin', 'Good', 'Strong'] },
      { title: 'Structure', share: 0.2, levels: ['Hard to follow', 'Some order', 'Clear', 'Very clear'] },
      { title: 'Language and spelling', share: 0.2, levels: ['Many errors', 'Some errors', 'Few errors', 'Accurate'] },
    ],
  },
  {
    key: 'practical', name: 'Practical or lab report', hint: 'Experiments and fieldwork',
    criteria: [
      { title: 'Method', share: 0.3, levels: ['Missing', 'Unclear', 'Clear', 'Repeatable'] },
      { title: 'Results', share: 0.3, levels: ['Missing', 'Partial', 'Complete', 'Complete and tidy'] },
      { title: 'Conclusion', share: 0.4, levels: ['None', 'States result', 'Explains result', 'Explains and evaluates'] },
    ],
  },
];

@Injectable()
export class RubricsService {
  constructor(private prisma: PrismaService, private education: EducationService) {}

  private async assignmentFor(user: UserProfile, assignmentId: string, allowStudent = false) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, title: true, maxPoints: true, dueDate: true, cohort: { select: { id: true, name: true, teacherId: true } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    const role = user.role as UserRole;
    if (role === UserRole.ADMIN || assignment.cohort.teacherId === user.id) return assignment;
    if (allowStudent && role === UserRole.STUDENT) {
      const inCohort = await this.prisma.cohortRoster.count({ where: { cohortId: assignment.cohort.id, studentId: user.id } });
      if (inCohort) return assignment;
    }
    throw new ForbiddenException('Not your assignment');
  }

  private shape(rubric: { id: string; criteria: { id: string; title: string; weight: number; descriptors: unknown }[] } | null) {
    if (!rubric) return null;
    const criteria = rubric.criteria.map(c => ({ id: c.id, title: c.title, weight: c.weight, descriptors: (Array.isArray(c.descriptors) ? c.descriptors : []) as RubricLevel[] }));
    return { id: rubric.id, criteria, total: criteria.reduce((n, c) => n + c.weight, 0) };
  }

  async getRubric(user: UserProfile, assignmentId: string) {
    const assignment = await this.assignmentFor(user, assignmentId, true);
    const rubric = await this.prisma.assignmentRubric.findUnique({ where: { assignmentId }, include: { criteria: { orderBy: { sortOrder: 'asc' } } } });
    const graded = rubric ? await this.prisma.rubricScore.count({ where: { criterion: { rubricId: rubric.id } } }) : 0;
    return { assignment, rubric: this.shape(rubric), gradedWithIt: graded, templates: RUBRIC_TEMPLATES };
  }

  private validate(criteria: CriterionInput[]) {
    if (!Array.isArray(criteria) || !criteria.length) throw new BadRequestException('Add at least one criterion');
    if (criteria.length > 12) throw new BadRequestException('Up to 12 criteria');
    return criteria.map((c, i) => {
      const title = String(c.title ?? '').trim();
      if (!title || title.length > 160) throw new BadRequestException(`Criterion ${i + 1} needs a name (max 160 characters)`);
      const weight = Math.round(Number(c.weight));
      if (!Number.isFinite(weight) || weight < 1 || weight > 1000) throw new BadRequestException(`"${title}" must be worth 1 to 1000 marks`);
      const levels = (Array.isArray(c.descriptors) ? c.descriptors : []).map(l => ({ points: Math.round(Number(l.points)), label: String(l.label ?? '').trim().slice(0, 200) }));
      if (levels.length < 2 || levels.length > 6) throw new BadRequestException(`"${title}" needs 2 to 6 levels`);
      for (const l of levels) {
        if (!Number.isFinite(l.points) || l.points < 0 || l.points > weight) throw new BadRequestException(`"${title}": level marks must be between 0 and ${weight}`);
      }
      levels.sort((a, b) => a.points - b.points);
      return { id: c.id, title, weight, descriptors: levels, sortOrder: i };
    });
  }

  /** Create or replace the rubric. Criteria already used for grading can be edited but not removed. */
  async saveRubric(user: UserProfile, assignmentId: string, input: CriterionInput[]) {
    await this.assignmentFor(user, assignmentId);
    const criteria = this.validate(input);
    const existing = await this.prisma.assignmentRubric.findUnique({ where: { assignmentId }, include: { criteria: { include: { _count: { select: { scores: true } } } } } });

    await this.prisma.$transaction(async tx => {
      const rubric = existing ?? await tx.assignmentRubric.create({ data: { assignmentId } });
      const keep = new Set(criteria.map(c => c.id).filter(Boolean));
      for (const old of existing?.criteria ?? []) {
        if (keep.has(old.id)) continue;
        if (old._count.scores) throw new BadRequestException(`"${old.title}" has already been used for grading, so it can't be removed`);
        await tx.rubricCriterion.delete({ where: { id: old.id } });
      }
      for (const c of criteria) {
        const data = { title: c.title, weight: c.weight, descriptors: c.descriptors, sortOrder: c.sortOrder };
        if (c.id && existing?.criteria.some(o => o.id === c.id)) await tx.rubricCriterion.update({ where: { id: c.id }, data });
        else await tx.rubricCriterion.create({ data: { ...data, rubricId: rubric.id } });
      }
    });
    return this.getRubric(user, assignmentId);
  }

  async deleteRubric(user: UserProfile, assignmentId: string) {
    await this.assignmentFor(user, assignmentId);
    const rubric = await this.prisma.assignmentRubric.findUnique({ where: { assignmentId }, select: { id: true } });
    if (!rubric) return { deleted: false };
    const used = await this.prisma.rubricScore.count({ where: { criterion: { rubricId: rubric.id } } });
    if (used) throw new BadRequestException('This rubric has been used for grading, so it can only be edited');
    await this.prisma.assignmentRubric.delete({ where: { id: rubric.id } });
    return { deleted: true };
  }

  /** Score each criterion, then grade through the normal flow (student is notified, XP awarded). Re-grading replaces the scores. */
  async gradeWithRubric(user: UserProfile, submissionId: string, dto: { scores: { criterionId: string; score: number; comment?: string }[]; feedback?: string }) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: { include: { rubric: { include: { criteria: true } } } } },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    await this.assignmentFor(user, submission.assignmentId);
    const criteria = submission.assignment.rubric?.criteria;
    if (!criteria?.length) throw new NotFoundException('This assignment has no rubric');

    const byId = new Map((dto.scores ?? []).map(s => [s.criterionId, s]));
    const rows = criteria.map(c => {
      const s = byId.get(c.id);
      if (!s) throw new BadRequestException(`Score "${c.title}"`);
      const score = Math.round(Number(s.score));
      if (!Number.isFinite(score) || score < 0 || score > c.weight) throw new BadRequestException(`"${c.title}" must be between 0 and ${c.weight}`);
      return { submissionId, criterionId: c.id, graderId: user.id, score, comment: s.comment?.trim() || null };
    });
    const total = criteria.reduce((n, c) => n + c.weight, 0);
    const earned = rows.reduce((n, r) => n + r.score, 0);
    const grade = Math.round((earned / total) * submission.assignment.maxPoints);

    await this.prisma.$transaction([
      this.prisma.rubricScore.deleteMany({ where: { submissionId } }),
      this.prisma.rubricScore.createMany({ data: rows }),
    ]);
    await this.education.gradeSubmission(user, submissionId, { grade, feedback: dto.feedback?.trim() || undefined });
    return { grade, maxPoints: submission.assignment.maxPoints, rubricScore: earned, rubricTotal: total };
  }

  async getSubmissionScores(user: UserProfile, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({ where: { id: submissionId }, select: { studentId: true, assignmentId: true } });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.studentId !== user.id) await this.assignmentFor(user, submission.assignmentId);
    return this.prisma.rubricScore.findMany({ where: { submissionId }, include: { criterion: true } });
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
