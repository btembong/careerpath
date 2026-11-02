import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuestionDifficulty, QuestionStatus, QuestionType, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface QuestionInput {
  courseId: string; moduleId?: string | null; sourceLessonId?: string | null;
  questionText: string; type: QuestionType; difficulty?: QuestionDifficulty;
  options?: { id: string; text: string }[] | null; correctAnswer?: string;
  parts?: { label: string; text: string; marks: number; markScheme?: string }[] | null;
  explanation?: string | null; tags?: string[]; points?: number; imageUrl?: string | null;
}

const WRITABLE: QuestionType[] = [QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK, QuestionType.SHORT_ANSWER, QuestionType.WRITTEN, QuestionType.STRUCTURED];
const PAGE = 50;

@Injectable()
export class QuestionBankService {
  constructor(private prisma: PrismaService) {}

  private isAdmin = (u: UserProfile) => u.role === 'ADMIN';

  /** Admin sees all; a teacher their own courses; a reviewer the courses assigned to them */
  private async courseScope(u: UserProfile): Promise<Prisma.PlatformCourseWhereInput> {
    if (this.isAdmin(u)) return {};
    if (u.role === 'SUBJECT_REVIEWER') {
      const assigned = await this.prisma.courseAssignment.findMany({ where: { reviewerId: u.id }, select: { courseId: true } });
      return { id: { in: assigned.map(a => a.courseId) } };
    }
    return { teacherId: u.id };
  }

  private async assertCourse(u: UserProfile, courseId: string) {
    const c = await this.prisma.platformCourse.findFirst({ where: { id: courseId, ...(await this.courseScope(u)) }, select: { id: true } });
    if (!c) throw new ForbiddenException('That course isn’t yours');
  }

  private async get(u: UserProfile, id: string) {
    const q = await this.prisma.questionBank.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    await this.assertCourse(u, q.courseId);
    return q;
  }

  async courses(u: UserProfile) {
    return this.prisma.platformCourse.findMany({
      where: await this.courseScope(u), orderBy: { title: 'asc' },
      select: {
        id: true, title: true, programmeId: true,
        programme: { select: { id: true, name: true, shortName: true } },
        modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } } },
      },
    });
  }

  async list(u: UserProfile, q: Record<string, string>) {
    const scope: Prisma.QuestionBankWhereInput = this.isAdmin(u) ? {} : { courseId: { in: (await this.prisma.platformCourse.findMany({ where: await this.courseScope(u), select: { id: true } })).map(c => c.id) } };
    const where: Prisma.QuestionBankWhereInput = { ...scope };
    if (q.courseId) where.courseId = q.courseId;
    else if (q.programmeId) where.courseId = { in: (await this.prisma.platformCourse.findMany({ where: { programmeId: q.programmeId, ...(await this.courseScope(u)) }, select: { id: true } })).map(c => c.id) };
    if (q.difficulty) where.difficulty = q.difficulty as QuestionDifficulty;
    if (q.type) where.type = q.type as QuestionType;
    if (q.status) where.status = q.status as QuestionStatus;
    if (q.missing === 'explanation') where.AND = [{ OR: [{ explanation: null }, { explanation: '' }] }];
    if (q.search?.trim()) where.questionText = { contains: q.search.trim(), mode: 'insensitive' };

    const page = Math.max(Number(q.page) || 1, 1);
    const [rows, total, stats] = await Promise.all([
      this.prisma.questionBank.findMany({ where, orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }], skip: (page - 1) * PAGE, take: PAGE }),
      this.prisma.questionBank.count({ where }),
      this.stats(scope),
    ]);
    const [courses, answers, lessons] = await Promise.all([
      this.prisma.platformCourse.findMany({ where: { id: { in: [...new Set(rows.map(r => r.courseId))] } }, select: { id: true, title: true, programme: { select: { shortName: true, name: true } } } }),
      this.prisma.testAnswer.groupBy({ by: ['questionId', 'isCorrect'], where: { questionId: { in: rows.map(r => r.id) }, isCorrect: { not: null } }, _count: true }),
      this.prisma.lesson.findMany({ where: { id: { in: rows.map(r => r.sourceLessonId ?? r.lessonId).filter((x): x is string => !!x) } }, select: { id: true, title: true, module: { select: { title: true } } } }),
    ]);
    const cBy = new Map(courses.map(c => [c.id, c]));
    const lBy = new Map(lessons.map(l => [l.id, l]));
    return {
      total, page, pageSize: PAGE, stats,
      rows: rows.map(r => {
        const c = cBy.get(r.courseId);
        const l = lBy.get(r.sourceLessonId ?? r.lessonId ?? '');
        const n = answers.filter(a => a.questionId === r.id).reduce((s, a) => s + a._count, 0);
        const right = answers.find(a => a.questionId === r.id && a.isCorrect)?._count ?? 0;
        return {
          id: r.id, text: r.questionText, type: r.type, difficulty: r.difficulty, status: r.status, bankOnly: r.bankOnly, reviewNote: r.reviewNote,
          courseId: r.courseId, courseTitle: c?.title ?? '', programme: c?.programme?.shortName ?? c?.programme?.name ?? null, moduleTitle: l?.module.title ?? null, lessonTitle: l?.title ?? null,
          hasExplanation: !!r.explanation?.trim(), answered: n, percentRight: n >= 5 ? Math.round((right / n) * 100) : null,
        };
      }),
    };
  }

  private async stats(scope: Prisma.QuestionBankWhereInput) {
    const [all, noWhy, mediumOnly, inReview, drafts] = await Promise.all([
      this.prisma.questionBank.count({ where: scope }),
      this.prisma.questionBank.count({ where: { ...scope, OR: [{ explanation: null }, { explanation: '' }] } }),
      this.prisma.questionBank.count({ where: { ...scope, difficulty: QuestionDifficulty.MEDIUM } }),
      this.prisma.questionBank.count({ where: { ...scope, status: QuestionStatus.IN_REVIEW } }),
      this.prisma.questionBank.count({ where: { ...scope, status: QuestionStatus.DRAFT } }),
    ]);
    return { all, noWhy, mediumOnly, inReview, drafts };
  }

  async one(u: UserProfile, id: string) {
    return this.get(u, id);
  }

  /** Checks a question and returns what to store */
  private async clean(dto: Partial<QuestionInput> & { courseId: string; type: QuestionType }) {
    if (!WRITABLE.includes(dto.type)) throw new BadRequestException('Pick a question type.');
    const text = (dto.questionText ?? '').trim();
    if (text.length < 5) throw new BadRequestException('Write the question first.');
    const correct = (dto.correctAnswer ?? '').trim();
    let options: { id: string; text: string }[] | null = null;
    let parts: { label: string; text: string; marks: number; markScheme: string }[] | null = null;
    let points = Math.max(Math.round(Number(dto.points) || 1), 1);

    if (dto.type === QuestionType.MCQ) {
      options = (dto.options ?? []).map((o, i) => ({ id: o.id || String.fromCharCode(97 + i), text: (o.text ?? '').trim() })).filter(o => o.text);
      if (options.length < 2) throw new BadRequestException('Give at least two answers.');
      if (!options.some(o => o.id === correct)) throw new BadRequestException('Tick the correct answer.');
    } else if (dto.type === QuestionType.TRUE_FALSE) {
      if (!['true', 'false'].includes(correct.toLowerCase())) throw new BadRequestException('Say whether it’s true or false.');
    } else if (dto.type === QuestionType.FILL_BLANK) {
      if (!correct) throw new BadRequestException('Give the word that fills the blank.');
    } else if (dto.type === QuestionType.STRUCTURED) {
      parts = (dto.parts ?? []).map((p, i) => ({ label: (p.label ?? '').trim() || `(${String.fromCharCode(97 + i)})`, text: (p.text ?? '').trim(), marks: Math.round(Number(p.marks) || 0), markScheme: (p.markScheme ?? '').trim() })).filter(p => p.text);
      if (!parts.length) throw new BadRequestException('Add at least one part.');
      if (parts.some(p => p.marks < 1)) throw new BadRequestException('Give every part its marks.');
      points = parts.reduce((n, p) => n + p.marks, 0);
    }

    let moduleId = dto.moduleId || null;
    const sourceLessonId = dto.sourceLessonId || null;
    if (sourceLessonId) {
      const l = await this.prisma.lesson.findFirst({ where: { id: sourceLessonId, module: { courseId: dto.courseId } }, select: { moduleId: true } });
      if (!l) throw new BadRequestException('That lesson isn’t in this course.');
      moduleId = l.moduleId;
    } else if (moduleId && !(await this.prisma.courseModule.count({ where: { id: moduleId, courseId: dto.courseId } }))) {
      throw new BadRequestException('That module isn’t in this course.');
    }
    return {
      questionText: text, type: dto.type, difficulty: dto.difficulty ?? QuestionDifficulty.MEDIUM,
      options: options ?? Prisma.DbNull, parts: parts ?? Prisma.DbNull, correctAnswer: correct, points,
      explanation: (dto.explanation ?? '').trim() || null, moduleId, sourceLessonId,
      tags: (dto.tags ?? []).map(t => t.trim()).filter(Boolean).slice(0, 12), imageUrl: dto.imageUrl || null,
    };
  }

  async create(u: UserProfile, dto: QuestionInput) {
    await this.assertCourse(u, dto.courseId);
    const data = await this.clean(dto);
    return this.prisma.questionBank.create({ data: { ...data, courseId: dto.courseId, bankOnly: true, status: QuestionStatus.DRAFT, createdById: u.id } });
  }

  async update(u: UserProfile, id: string, dto: Partial<QuestionInput>) {
    const q = await this.get(u, id);
    const merged = {
      courseId: q.courseId, type: dto.type ?? q.type, questionText: dto.questionText ?? q.questionText,
      difficulty: dto.difficulty ?? q.difficulty, correctAnswer: dto.correctAnswer ?? q.correctAnswer,
      options: dto.options !== undefined ? dto.options : (q.options as QuestionInput['options']),
      parts: dto.parts !== undefined ? dto.parts : (q.parts as QuestionInput['parts']),
      explanation: dto.explanation !== undefined ? dto.explanation : q.explanation,
      moduleId: dto.moduleId !== undefined ? dto.moduleId : q.moduleId,
      sourceLessonId: dto.sourceLessonId !== undefined ? dto.sourceLessonId : q.sourceLessonId,
      tags: dto.tags ?? q.tags, points: dto.points ?? q.points, imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : q.imageUrl,
    };
    const data = await this.clean(merged);
    // A teacher's change to a live bank question is checked again before students see it
    const back = q.bankOnly && q.status === QuestionStatus.LIVE && !this.isAdmin(u) && u.role !== 'SUBJECT_REVIEWER';
    return this.prisma.questionBank.update({ where: { id }, data: { ...data, ...(back ? { status: QuestionStatus.DRAFT } : {}) } });
  }

  async remove(u: UserProfile, id: string) {
    const q = await this.get(u, id);
    if (!q.bankOnly) throw new BadRequestException('This question is part of a lesson quiz. Remove it from the course builder.');
    await this.prisma.questionBank.delete({ where: { id } });
    return { deleted: true };
  }

  async submitForReview(u: UserProfile, id: string) {
    const q = await this.get(u, id);
    if (q.status !== QuestionStatus.DRAFT) throw new BadRequestException('Only drafts can be sent for review.');
    const marked = q.type === QuestionType.STRUCTURED;
    if (!marked && !q.explanation?.trim()) throw new BadRequestException('Add why the answer is right before sending it for review.');
    if (marked && (q.parts as { markScheme?: string }[] | null)?.some(p => !p.markScheme?.trim())) throw new BadRequestException('Add a marking scheme to every part first.');
    return this.prisma.questionBank.update({ where: { id }, data: { status: QuestionStatus.IN_REVIEW, reviewNote: null } });
  }

  async decide(u: UserProfile, id: string, dto: { approve: boolean; note?: string }) {
    const q = await this.get(u, id);
    if (q.status !== QuestionStatus.IN_REVIEW && !(this.isAdmin(u) && q.status === QuestionStatus.DRAFT)) throw new BadRequestException('This question isn’t waiting for review.');
    if (!dto.approve && !dto.note?.trim()) throw new BadRequestException('Say what needs fixing.');
    return this.prisma.questionBank.update({
      where: { id },
      data: dto.approve ? { status: QuestionStatus.LIVE, reviewNote: null } : { status: QuestionStatus.DRAFT, reviewNote: dto.note!.trim() },
    });
  }

  /** Columns: question, type, a, b, c, d, correct, explanation, difficulty, module, tags. Good rows become drafts; bad rows are reported back. */
  async importRows(u: UserProfile, dto: { courseId: string; rows: Record<string, string>[] }) {
    await this.assertCourse(u, dto.courseId);
    const rows = dto.rows ?? [];
    if (!rows.length) throw new BadRequestException('The file has no questions.');
    if (rows.length > 1000) throw new BadRequestException('Import up to 1,000 questions at a time.');
    const modules = await this.prisma.courseModule.findMany({ where: { courseId: dto.courseId }, select: { id: true, title: true } });
    const moduleBy = new Map(modules.map(m => [m.title.trim().toLowerCase(), m.id]));
    const TYPES: Record<string, QuestionType> = { mcq: QuestionType.MCQ, 'true/false': QuestionType.TRUE_FALSE, true_false: QuestionType.TRUE_FALSE, fill: QuestionType.FILL_BLANK, fill_blank: QuestionType.FILL_BLANK, short: QuestionType.SHORT_ANSWER, short_answer: QuestionType.SHORT_ANSWER, essay: QuestionType.WRITTEN, written: QuestionType.WRITTEN };
    const errors: { row: number; message: string }[] = [];
    let created = 0;
    for (const [i, r] of rows.entries()) {
      try {
        const type = TYPES[(r.type ?? 'mcq').trim().toLowerCase()];
        if (!type) throw new BadRequestException(`Unknown type "${r.type}".`);
        const difficulty = (r.difficulty ?? 'MEDIUM').trim().toUpperCase() as QuestionDifficulty;
        if (!Object.values(QuestionDifficulty).includes(difficulty)) throw new BadRequestException(`Unknown difficulty "${r.difficulty}".`);
        const modName = (r.module ?? '').trim().toLowerCase();
        if (modName && !moduleBy.has(modName)) throw new BadRequestException(`No module called "${r.module}" in this course.`);
        const options = ['a', 'b', 'c', 'd', 'e'].filter(k => (r[k] ?? '').trim()).map(k => ({ id: k, text: r[k].trim() }));
        const data = await this.clean({
          courseId: dto.courseId, type, questionText: r.question, difficulty, options,
          correctAnswer: type === QuestionType.MCQ ? (r.correct ?? '').trim().toLowerCase() : r.correct,
          explanation: r.explanation, moduleId: modName ? moduleBy.get(modName) : null,
          tags: (r.tags ?? '').split(/[;,]/),
        });
        await this.prisma.questionBank.create({ data: { ...data, courseId: dto.courseId, bankOnly: true, status: QuestionStatus.DRAFT, createdById: u.id } });
        created++;
      } catch (e) {
        errors.push({ row: i + 2, message: (e as Error).message });
      }
    }
    return { created, errors };
  }
}
