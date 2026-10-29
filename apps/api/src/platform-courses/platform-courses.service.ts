import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UserProfile, CourseStatus, CourseSource, UserRole } from '@prisma/client';
import { WordPressService } from '../wordpress/wordpress.service';
import { CertificatesService } from '../certificates/certificates.service';
import { FilesService } from '../files/files.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { courseChecklist, COURSE_TEMPLATE } from './course-quality';
import * as crypto from 'crypto';

@Injectable()
export class PlatformCoursesService {
  private readonly logger = new Logger(PlatformCoursesService.name);

  constructor(
    private prisma: PrismaService,
    private certificates: CertificatesService,
    private wp: WordPressService,
    private files: FilesService,
    private gamification: GamificationService,
    private notifications: NotificationsService,
  ) {}

  // ── Course CRUD ───────────────────────────────────────────

  async createCourse(actor: UserProfile, dto: {
    title: string; description?: string; coverUrl?: string;
    programmeId?: string; subjectId?: string; levelId?: string;
    teacherId?: string;
  }) {
    const teacherId = (actor.role as UserRole) === UserRole.ADMIN
      ? (dto.teacherId ?? actor.id)
      : actor.id;

    return this.prisma.platformCourse.create({
      data: {
        title: dto.title,
        description: dto.description,
        coverUrl: dto.coverUrl,
        programmeId: dto.programmeId,
        subjectId: dto.subjectId,
        levelId: dto.levelId,
        teacherId,
        status: CourseStatus.DRAFT,
      },
      include: courseIncludes(),
    });
  }

  async listCourses(opts: {
    actorId?: string; role?: string;
    programmeId?: string; subjectId?: string;
    status?: CourseStatus; published?: boolean;
    source?: CourseSource;
  }) {
    const { actorId, role, programmeId, subjectId, status, published, source } = opts;
    const where: any = {};

    if (role === UserRole.TEACHER) where.teacherId = actorId;
    if (role === UserRole.STUDENT) where.status = CourseStatus.PUBLISHED;
    if (status) where.status = status;
    if (published) where.status = CourseStatus.PUBLISHED;
    if (programmeId) where.programmeId = programmeId;
    if (subjectId) where.subjectId = subjectId;
    if (source) where.source = source;

    return this.prisma.platformCourse.findMany({
      where,
      include: {
        programme: { select: { id: true, name: true, shortName: true, type: true } },
        subject:   { select: { id: true, name: true, category: true } },
        level:     { select: { id: true, name: true, tier: true } },
        teacher:   { select: { id: true, email: true } },
        _count:    { select: { modules: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Bulk Assignment ───────────────────────────────────────

  async bulkAssignCourses(dto: {
    courseIds: string[];
    programmeId?: string;
    subjectId?: string;
    levelId?: string;
  }): Promise<{ updated: number }> {
    if (!dto.courseIds.length) return { updated: 0 };
    const data: Record<string, string> = {};
    if (dto.programmeId) data.programmeId = dto.programmeId;
    if (dto.subjectId)   data.subjectId   = dto.subjectId;
    if (dto.levelId)     data.levelId     = dto.levelId;
    if (!Object.keys(data).length) return { updated: 0 };

    const result = await this.prisma.platformCourse.updateMany({
      where: { id: { in: dto.courseIds } },
      data,
    });
    return { updated: result.count };
  }

  // ── WordPress Sync ────────────────────────────────────────

  async syncWpCourses(wp: WordPressService, adminId: string): Promise<{ created: number; updated: number; total: number }> {
    const wpCourses = await wp.getCourses();
    let created = 0;
    let updated = 0;

    for (const wc of wpCourses) {
      const title = (wc.title?.rendered ?? 'Untitled').trim() || 'Untitled';
      const rawDesc = (wc.content?.rendered ?? '').replace(/<[^>]*>/g, '').trim();
      const description = rawDesc.slice(0, 500) || null;
      const wpCourseUrl = wc.link ?? null;

      const existing = await this.prisma.platformCourse.findUnique({
        where: { wpCourseId: wc.id },
      });

      if (existing) {
        await this.prisma.platformCourse.update({
          where: { id: existing.id },
          data: { title, description, wpCourseUrl },
        });
        updated++;
      } else {
        await this.prisma.platformCourse.create({
          data: {
            title,
            description,
            source: CourseSource.WORDPRESS,
            wpCourseId: wc.id,
            wpCourseUrl,
            teacherId: adminId,
            status: CourseStatus.PUBLISHED,
          },
        });
        created++;
      }
    }

    await wp.invalidateCourseCache();
    return { created, updated, total: wpCourses.length };
  }

  async getCourse(id: string, viewer: UserProfile) {
    const isStudent = (viewer.role as UserRole) === UserRole.STUDENT;
    const course = await this.prisma.platformCourse.findUniqueOrThrow({
      where: { id },
      include: {
        ...courseIncludes(),
        enrollments: isStudent ? { where: { studentId: viewer.id } } : false,
      },
    });

    // Admins and the course's own teacher see everything; anyone else only sees paid lesson content
    // when they have access (free previews excepted) — otherwise this endpoint bypassed the paywall.
    const isOwnerOrAdmin = (viewer.role as UserRole) === UserRole.ADMIN || course.teacherId === viewer.id;
    if (isOwnerOrAdmin) return course;
    const hasAccess = isStudent && (await this.studentHasCourseAccess(viewer.id, id));
    return {
      ...course,
      hasAccess,
      modules: course.modules.map(m => ({
        ...m,
        lessons: m.lessons.map(l => {
          const locked = !hasAccess && !l.isFree;
          return locked
            ? { ...l, videoUrl: null, videoUrlLow: null, content: null, transcript: null, attachments: [], locked }
            : { ...this.hideStoredVideo(l), locked };
        }),
      })),
    };
  }

  async updateCourse(id: string, actor: UserProfile, dto: {
    title?: string; description?: string; coverUrl?: string;
    programmeId?: string; subjectId?: string; levelId?: string;
    teacherId?: string; status?: CourseStatus;
    priceAmount?: number | null; priceCurrency?: string | null; isSoldIndividually?: boolean;
    shortDescription?: string | null; source?: CourseSource; wpCourseUrl?: string | null;
  }) {
    await this.assertCourseAccess(id, actor);
    const isAdmin = (actor.role as UserRole) === UserRole.ADMIN;
    // Teachers publish through submit-for-review and can't reassign courses — only admins change these
    const adminOnly = [dto.status, dto.teacherId, dto.source, dto.wpCourseUrl].some(v => v !== undefined);
    if (!isAdmin && adminOnly) {
      throw new ForbiddenException('Only admins can change a course’s status, teacher or source. Submit the course for review instead.');
    }
    // Prices are set by admins; teachers propose one through /price-proposal
    const pricing = [dto.priceAmount, dto.priceCurrency, dto.isSoldIndividually].some(v => v !== undefined);
    if (!isAdmin && pricing) {
      throw new ForbiddenException('Propose a price for approval instead of setting it directly.');
    }
    const data: Prisma.PlatformCourseUncheckedUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.shortDescription !== undefined && { shortDescription: dto.shortDescription }),
      ...(isAdmin && dto.source !== undefined && { source: dto.source }),
      ...(isAdmin && dto.wpCourseUrl !== undefined && { wpCourseUrl: dto.wpCourseUrl }),
      ...(dto.coverUrl !== undefined && { coverUrl: dto.coverUrl }),
      ...(dto.programmeId !== undefined && { programmeId: dto.programmeId }),
      ...(dto.subjectId !== undefined && { subjectId: dto.subjectId }),
      ...(dto.levelId !== undefined && { levelId: dto.levelId }),
      ...(isAdmin && dto.priceAmount !== undefined && { priceAmount: dto.priceAmount }),
      ...(isAdmin && dto.priceCurrency !== undefined && { priceCurrency: dto.priceCurrency ? dto.priceCurrency.toUpperCase() : null }),
      ...(isAdmin && dto.isSoldIndividually !== undefined && { isSoldIndividually: !!dto.isSoldIndividually }),
      ...(isAdmin && dto.status !== undefined && { status: dto.status }),
      ...(isAdmin && dto.teacherId !== undefined && { teacherId: dto.teacherId }),
    };
    return this.prisma.platformCourse.update({
      where: { id },
      data,
      include: courseIncludes(),
    });
  }

  async submitForReview(id: string, actor: UserProfile) {
    const course = await this.assertCourseAccess(id, actor);
    if (course.status !== CourseStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT courses can be submitted for review');
    }
    const missing = (await this.computeChecklist(id)).filter(i => i.required && !i.ok);
    if (missing.length) {
      throw new BadRequestException(`Before submitting: ${missing.map(i => i.label.toLowerCase()).join('; ')}.`);
    }
    return this.prisma.platformCourse.update({
      where: { id }, data: { status: CourseStatus.PENDING_REVIEW },
    });
  }

  // ── Course quality ────────────────────────────────────────

  private async computeChecklist(courseId: string) {
    const course = await this.prisma.platformCourse.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        coverUrl: true, shortDescription: true,
        modules: {
          orderBy: { sortOrder: 'asc' },
          select: {
            title: true,
            lessons: {
              orderBy: { sortOrder: 'asc' },
              select: { id: true, title: true, type: true, videoUrl: true, content: true, chapters: true },
            },
          },
        },
      },
    });
    const lessonIds = course.modules.flatMap(m => m.lessons.map(l => l.id));
    const counts = lessonIds.length
      ? await this.prisma.questionBank.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds } }, _count: { _all: true } })
      : [];
    const qCount = new Map(counts.map(c => [c.lessonId, c._count._all]));
    return courseChecklist({
      ...course,
      modules: course.modules.map(m => ({
        title: m.title,
        lessons: m.lessons.map(l => ({ ...l, questionCount: qCount.get(l.id) ?? 0 })),
      })),
    });
  }

  /** Teachers (own course), admins and subject reviewers can see a course's readiness checklist. */
  async getChecklist(courseId: string, actor: UserProfile) {
    if ((actor.role as UserRole) !== UserRole.SUBJECT_REVIEWER) await this.assertCourseAccess(courseId, actor);
    const items = await this.computeChecklist(courseId);
    return { items, readyToSubmit: items.every(i => !i.required || i.ok) };
  }

  /** Fills an empty course with the standard module/lesson structure. */
  async applyTemplate(courseId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    const existing = await this.prisma.courseModule.count({ where: { courseId } });
    if (existing) throw new BadRequestException('The template can only be applied to a course with no modules yet.');
    await this.prisma.$transaction(
      COURSE_TEMPLATE.map((mod, mi) =>
        this.prisma.courseModule.create({
          data: {
            courseId,
            title: mod.title,
            sortOrder: mi + 1,
            lessons: { create: mod.lessons.map((l, li) => ({ title: l.title, type: l.type, sortOrder: li + 1 })) },
          },
        }),
      ),
    );
    return this.getChecklist(courseId, actor);
  }

  async publishCourse(id: string) {
    const course = await this.prisma.platformCourse.update({
      where: { id }, data: { status: CourseStatus.PUBLISHED },
    });
    this.notifications.notify(course.teacherId, {
      type: 'system', title: 'Your course is live', body: `"${course.title}" is now published and visible to students.`,
      href: `/teacher/courses/${course.id}/builder`,
    });
    return course;
  }

  /** Send a course under review back to its teacher as a draft, with the reason. */
  async rejectCourse(id: string, notes?: string) {
    const existing = await this.prisma.platformCourse.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new NotFoundException('Course not found');
    if (existing.status !== CourseStatus.PENDING_REVIEW) throw new BadRequestException('Only courses waiting for review can be sent back');
    const course = await this.prisma.platformCourse.update({ where: { id }, data: { status: CourseStatus.DRAFT } });
    const reason = typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 1000) : 'No reason was given.';
    this.notifications.notify(course.teacherId, {
      type: 'system', title: 'Changes needed before publishing', body: `"${course.title}" was sent back: ${reason}`,
      href: `/teacher/courses/${course.id}/builder`,
    });
    return course;
  }

  async archiveCourse(id: string) {
    return this.prisma.platformCourse.update({
      where: { id }, data: { status: CourseStatus.ARCHIVED },
    });
  }

  // ── Modules ───────────────────────────────────────────────

  async addModule(courseId: string, actor: UserProfile, title: string) {
    await this.assertCourseAccess(courseId, actor);
    const last = await this.prisma.courseModule.findFirst({
      where: { courseId }, orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.courseModule.create({
      data: { courseId, title, sortOrder: (last?.sortOrder ?? 0) + 1 },
      include: { lessons: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async updateModule(courseId: string, moduleId: string, actor: UserProfile, title: string) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.courseModule.update({ where: { id: moduleId }, data: { title } });
  }

  async reorderModules(courseId: string, actor: UserProfile, orderedIds: string[]) {
    await this.assertCourseAccess(courseId, actor);
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.courseModule.update({ where: { id }, data: { sortOrder: idx + 1 } }),
      ),
    );
    return this.prisma.courseModule.findMany({
      where: { courseId }, orderBy: { sortOrder: 'asc' },
    });
  }

  async deleteModule(courseId: string, moduleId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.courseModule.delete({ where: { id: moduleId } });
  }

  // ── Lessons ───────────────────────────────────────────────

  async addLesson(courseId: string, moduleId: string, actor: UserProfile, dto: {
    title: string; type: string; videoUrl?: string; content?: string;
    durationSecs?: number; isFree?: boolean;
  }) {
    await this.assertCourseAccess(courseId, actor);
    const last = await this.prisma.lesson.findFirst({
      where: { moduleId }, orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        type: dto.type as any,
        videoUrl: dto.videoUrl,
        content: dto.content,
        durationSecs: dto.durationSecs,
        isFree: dto.isFree ?? false,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
      include: { attachments: true },
    });
  }

  async updateLesson(courseId: string, lessonId: string, actor: UserProfile, dto: {
    title?: string; videoUrl?: string | null; videoUrlLow?: string | null; content?: string | null;
    durationSecs?: number | null; isFree?: boolean;
    chapters?: unknown; transcript?: string | null;
  }) {
    await this.assertCourseAccess(courseId, actor);
    // The lesson must belong to this course — otherwise a teacher could edit another course's lesson
    const owned = await this.prisma.lesson.count({ where: { id: lessonId, module: { courseId } } });
    if (!owned) throw new NotFoundException('Lesson not found in this course');

    // Explicit field list: never pass the raw body to Prisma (it would allow moduleId etc.)
    const data: Prisma.LessonUpdateInput = {
      ...(dto.title !== undefined && { title: String(dto.title).slice(0, 200) }),
      ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl || null }),
      ...(dto.videoUrlLow !== undefined && { videoUrlLow: dto.videoUrlLow || null }),
      ...(dto.content !== undefined && { content: dto.content ?? null }),
      ...(dto.durationSecs !== undefined && { durationSecs: dto.durationSecs ?? null }),
      ...(dto.isFree !== undefined && { isFree: !!dto.isFree }),
      ...(dto.chapters !== undefined && { chapters: normaliseChapters(dto.chapters) ?? Prisma.DbNull }),
      ...(dto.transcript !== undefined && { transcript: dto.transcript ? String(dto.transcript).slice(0, 100_000) : null }),
    };
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data,
      include: { attachments: true },
    });
  }

  async reorderLessons(courseId: string, moduleId: string, actor: UserProfile, orderedIds: string[]) {
    await this.assertCourseAccess(courseId, actor);
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.lesson.update({ where: { id }, data: { sortOrder: idx + 1 } }),
      ),
    );
    return this.prisma.lesson.findMany({
      where: { moduleId }, orderBy: { sortOrder: 'asc' },
    });
  }

  async deleteLesson(courseId: string, lessonId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  async addAttachment(lessonId: string, dto: { name: string; url: string; fileType?: string }) {
    return this.prisma.lessonAttachment.create({ data: { lessonId, ...dto } });
  }

  async deleteAttachment(id: string) {
    return this.prisma.lessonAttachment.delete({ where: { id } });
  }

  // ── Student Progress ──────────────────────────────────────

  async markLessonComplete(studentId: string, lessonId: string, watchedSecs?: number) {
    const before = await this.prisma.lessonProgress.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
      select: { completed: true, watchedSecs: true },
    });
    const result = await this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      // Keep the larger watch time — completing without a value must not wipe recorded study time
      update: { completed: true, watchedSecs: Math.max(before?.watchedSecs ?? 0, watchedSecs ?? 0) },
      create: { studentId, lessonId, completed: true, watchedSecs: watchedSecs ?? 0 },
    });

    if (!before?.completed) {
      await this.gamification.awardOnce(studentId, 'LESSON_COMPLETE', lessonId);
    }

    // Auto-issue certificate when course reaches 100%
    await this.checkAndIssueCertificate(studentId, lessonId);

    return result;
  }

  private async checkAndIssueCertificate(studentId: string, lessonId: string) {
    try {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { module: { select: { courseId: true } } },
      });
      if (!lesson) return;
      const courseId = lesson.module.courseId;

      const [totalLessons, completedLessons] = await Promise.all([
        this.prisma.lesson.count({ where: { module: { courseId } } }),
        this.prisma.lessonProgress.count({
          where: { studentId, completed: true, lesson: { module: { courseId } } },
        }),
      ]);

      if (totalLessons > 0 && completedLessons >= totalLessons) {
        // Mark enrollment complete
        await this.prisma.courseEnrollment.updateMany({
          where: { studentId, courseId },
          data: { completedAt: new Date() },
        });
        // Issue certificate (idempotent — no-op if already issued)
        await this.certificates.issueCertificate(studentId, courseId);
      }
    } catch { /* non-critical */ }
  }

  /** Student-facing "mark complete": checks the lesson is theirs to complete before recording it. */
  async completeLesson(studentId: string, courseId: string, lessonId: string, watchedSecs?: number) {
    await this.assertStudentLesson(studentId, courseId, lessonId);
    return this.markLessonComplete(studentId, lessonId, watchedSecs);
  }

  /**
   * Called while a video plays. `deltaSecs` (seconds actually played since the last report) is added
   * to study time — capped so a client can't inflate it — and `positionSecs` is kept for resume.
   */
  async recordWatch(studentId: string, courseId: string, lessonId: string, positionSecs: number, deltaSecs: number) {
    const lesson = await this.assertStudentLesson(studentId, courseId, lessonId);
    const MAX_DELTA = 90; // client reports every ~30 s; allow slack for slow networks
    const delta = Math.min(Math.max(0, Math.floor(Number(deltaSecs) || 0)), MAX_DELTA);
    const limit = lesson.durationSecs ? lesson.durationSecs : Number.MAX_SAFE_INTEGER;
    const position = Math.min(Math.max(0, Math.floor(Number(positionSecs) || 0)), limit);
    return this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      update: { watchedSecs: { increment: delta }, positionSecs: position },
      create: { studentId, lessonId, watchedSecs: delta, positionSecs: position, completed: false },
      select: { watchedSecs: true, positionSecs: true, completed: true },
    });
  }

  async getCourseProgress(studentId: string, courseId: string) {
    const course = await this.prisma.platformCourse.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            lessons: {
              orderBy: { sortOrder: 'asc' },
              include: { progress: { where: { studentId } } },
            },
          },
        },
      },
    });

    const allLessons = course.modules.flatMap(m => m.lessons);
    const completedCount = allLessons.filter(l => l.progress[0]?.completed).length;
    const hasAccess = await this.studentHasCourseAccess(studentId, courseId);

    return {
      courseId,
      hasAccess,
      totalLessons: allLessons.length,
      completedLessons: completedCount,
      percentComplete: allLessons.length ? Math.round((completedCount / allLessons.length) * 100) : 0,
      modules: course.modules.map(m => ({
        ...m,
        lessons: m.lessons.map(l => {
          // Without access, only the outline is returned — paid video/text stays locked (free previews excepted)
          const locked = !hasAccess && !l.isFree;
          return {
            ...this.hideStoredVideo(l),
            ...(locked && { videoUrl: null, content: null, transcript: null }),
            locked,
            progress: l.progress[0] ?? null,
          };
        }),
      })),
    };
  }

  // ── Signed video URL ──────────────────────────────────────

  /**
   * Return a short-lived signed URL for a VIDEO lesson.
   * Validates that the student is enrolled before signing.
   * Non-R2 URLs (YouTube / Vimeo) pass through unsigned.
   */
  async getSignedVideoUrl(courseId: string, lessonId: string, studentId: string): Promise<{ url: string; lowUrl: string | null }> {
    // Package buyers usually have no CourseEnrollment row, so check real access, not just enrollment
    const lesson = await this.assertStudentLesson(studentId, courseId, lessonId);
    if (!lesson.videoUrl) throw new NotFoundException('Lesson has no video');

    const [url, lowUrl] = await Promise.all([
      this.files.signUrl(lesson.videoUrl),
      lesson.videoUrlLow ? this.files.signUrl(lesson.videoUrlLow) : null,
    ]);
    return { url, lowUrl };
  }

  // ── Quiz: Questions ──────────────────────────────────────

  /** The lesson must belong to the course; used by every teacher-side question action. */
  private async lessonOfCourse(courseId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { courseId } } });
    if (!lesson) throw new NotFoundException('Lesson not found in this course');
    return lesson;
  }

  /**
   * The course's teacher and admins get answers; students with access get the questions only
   * (no answers or explanations until they submit). Other teachers get nothing.
   */
  async getQuestions(courseId: string, lessonId: string, viewer: UserProfile) {
    const role = viewer.role as UserRole;
    if (role === UserRole.STUDENT) {
      await this.assertStudentLesson(viewer.id, courseId, lessonId);
    } else {
      await this.assertCourseAccess(courseId, viewer); // owner teacher or admin
      await this.lessonOfCourse(courseId, lessonId);
    }
    const questions = await this.prisma.questionBank.findMany({
      where: { lessonId },
      orderBy: { sortOrder: 'asc' },
    });
    if (role !== UserRole.STUDENT) return questions;
    return questions.map(({ correctAnswer, explanation, videoAtSec, ...q }) => q);
  }

  /** Validates a question body; practice questions (non-quiz lessons) must be auto-markable MCQs. */
  private questionData(dto: any, lessonType: string, partial: boolean): Prisma.QuestionBankUncheckedUpdateInput {
    const data: Prisma.QuestionBankUncheckedUpdateInput = {};
    if (!partial || dto.type !== undefined) {
      if (!['MCQ', 'WRITTEN'].includes(dto.type)) throw new BadRequestException('type must be MCQ or WRITTEN');
      if (lessonType !== 'QUIZ' && dto.type !== 'MCQ') throw new BadRequestException('Practice questions must be multiple choice so they can be marked instantly');
      data.type = dto.type;
    }
    if (!partial || dto.questionText !== undefined) {
      const text = String(dto.questionText ?? '').trim();
      if (!text || text.length > 2000) throw new BadRequestException('Question text is required (max 2000 characters)');
      data.questionText = text;
    }
    if (dto.options !== undefined) {
      if (dto.options !== null && (!Array.isArray(dto.options) || dto.options.length > 8)) throw new BadRequestException('options must be a list of up to 8 choices');
      data.options = dto.options ?? Prisma.DbNull;
    }
    if (!partial || dto.correctAnswer !== undefined) data.correctAnswer = String(dto.correctAnswer ?? '');
    if (dto.explanation !== undefined) data.explanation = dto.explanation ? String(dto.explanation).slice(0, 4000) : null;
    if (dto.videoAtSec !== undefined) {
      const v = dto.videoAtSec === null || dto.videoAtSec === '' ? null : Math.floor(Number(dto.videoAtSec));
      if (v !== null && (!Number.isFinite(v) || v < 0)) throw new BadRequestException('videoAtSec must be a non-negative number of seconds');
      data.videoAtSec = v;
    }
    return data;
  }

  async addQuestion(courseId: string, lessonId: string, actor: UserProfile, dto: any) {
    await this.assertCourseAccess(courseId, actor);
    const lesson = await this.lessonOfCourse(courseId, lessonId);
    const data = this.questionData(dto, lesson.type, false);
    const last = await this.prisma.questionBank.findFirst({
      where: { lessonId }, orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.questionBank.create({
      data: {
        ...(data as Prisma.QuestionBankUncheckedCreateInput),
        courseId,
        lessonId,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateQuestion(courseId: string, lessonId: string, questionId: string, actor: UserProfile, dto: any) {
    await this.assertCourseAccess(courseId, actor);
    const lesson = await this.lessonOfCourse(courseId, lessonId);
    const owned = await this.prisma.questionBank.count({ where: { id: questionId, lessonId } });
    if (!owned) throw new NotFoundException('Question not found in this lesson');
    return this.prisma.questionBank.update({ where: { id: questionId }, data: this.questionData(dto, lesson.type, true) });
  }

  async deleteQuestion(courseId: string, lessonId: string, questionId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    await this.lessonOfCourse(courseId, lessonId);
    const { count } = await this.prisma.questionBank.deleteMany({ where: { id: questionId, lessonId } });
    if (!count) throw new NotFoundException('Question not found in this lesson');
    return { deleted: true };
  }

  async updateQuizConfig(courseId: string, lessonId: string, actor: UserProfile, dto: {
    passMark?: number | null; timeLimitSecs?: number | null; maxAttempts?: number; shuffleQuestions?: boolean;
  }) {
    await this.assertCourseAccess(courseId, actor);
    await this.lessonOfCourse(courseId, lessonId);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.passMark !== undefined && { passMark: dto.passMark === null ? null : Math.min(100, Math.max(0, Math.round(Number(dto.passMark)))) }),
        ...(dto.timeLimitSecs !== undefined && { timeLimitSecs: dto.timeLimitSecs === null ? null : Math.max(0, Math.round(Number(dto.timeLimitSecs))) }),
        ...(dto.maxAttempts !== undefined && { maxAttempts: Math.max(0, Math.round(Number(dto.maxAttempts))) }),
        ...(dto.shuffleQuestions !== undefined && { shuffleQuestions: !!dto.shuffleQuestions }),
      },
    });
  }

  // ── Practice (video/text lessons) ────────────────────────

  async getPractice(studentId: string, courseId: string, lessonId: string) {
    const lesson = await this.assertStudentLesson(studentId, courseId, lessonId);
    if (lesson.type === 'QUIZ') return { questions: [], best: null };
    const [questions, attempts] = await Promise.all([
      this.prisma.questionBank.findMany({
        where: { lessonId, type: 'MCQ' },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, questionText: true, options: true, imageUrl: true },
      }),
      this.prisma.practiceAttempt.findMany({ where: { studentId, lessonId }, select: { score: true, total: true } }),
    ]);
    const best = attempts.reduce<{ score: number; total: number } | null>(
      (b, a) => (!b || a.score / a.total > b.score / b.total ? a : b), null,
    );
    return { questions, best, attempts: attempts.length };
  }

  /** Unlimited retries; reveals answers, worked solutions and the video moment that explains each one. */
  async submitPractice(studentId: string, courseId: string, lessonId: string, answers: Record<string, string>) {
    const lesson = await this.assertStudentLesson(studentId, courseId, lessonId);
    if (lesson.type === 'QUIZ') throw new BadRequestException('Use the quiz for quiz lessons');
    const questions = await this.prisma.questionBank.findMany({
      where: { lessonId, type: 'MCQ' },
      orderBy: { sortOrder: 'asc' },
    });
    if (!questions.length) throw new BadRequestException('This lesson has no practice questions');

    const results = questions.map(q => ({
      questionId: q.id,
      yourAnswer: answers[q.id] ?? null,
      correctAnswer: q.correctAnswer,
      isCorrect: answers[q.id] === q.correctAnswer,
      explanation: q.explanation,
      videoAtSec: q.videoAtSec,
    }));
    const score = results.filter(r => r.isCorrect).length;
    await this.prisma.practiceAttempt.create({ data: { studentId, lessonId, score, total: questions.length } });
    return { score, total: questions.length, results };
  }

  // ── Quiz: Student submit ──────────────────────────────────

  async submitQuizAttempt(studentId: string, courseId: string, lessonId: string, answersJson: Record<string, string>) {
    // Passing marks the lesson complete (XP, certificates), so require course access like any lesson action
    const lesson = await this.assertStudentLesson(studentId, courseId, lessonId);

    // Check attempt limit
    if (lesson.maxAttempts > 0) {
      const attemptCount = await this.prisma.quizAttempt.count({ where: { studentId, lessonId } });
      if (attemptCount >= lesson.maxAttempts) throw new BadRequestException('Maximum attempts reached');
    }

    const questions = await this.prisma.questionBank.findMany({
      where: { lessonId }, orderBy: { sortOrder: 'asc' },
    });
    if (questions.length === 0) throw new BadRequestException('This quiz has no questions yet');

    // Auto-score MCQ
    const mcqQuestions = questions.filter(q => q.type === 'MCQ');
    let autoScore = 0;
    for (const q of mcqQuestions) {
      if (answersJson[q.id] === q.correctAnswer) autoScore++;
    }

    const maxScore = mcqQuestions.length;
    const hasWritten = questions.some(q => q.type === 'WRITTEN');
    const percentage = maxScore > 0 ? Math.round((autoScore / maxScore) * 100) : 100;
    const passed = !hasWritten && (lesson.passMark == null || percentage >= lesson.passMark);

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        studentId, courseId, lessonId,
        answersJson,
        autoScore,
        finalScore: autoScore,
        maxScore,
        passed,
        isFullyGraded: !hasWritten,
      },
    });

    // Mark lesson complete if passed (or no pass requirement and no written questions)
    if (passed) {
      await this.gamification.awardOnce(studentId, 'QUIZ_PASS', lessonId, { perfect: percentage === 100 });
      await this.markLessonComplete(studentId, lessonId);
    }

    // Return results with correct answers revealed
    const results = questions.map(q => ({
      questionId: q.id,
      questionText: q.questionText,
      type: q.type,
      options: q.options,
      yourAnswer: answersJson[q.id] ?? null,
      correctAnswer: q.type === 'MCQ' ? q.correctAnswer : null,
      isCorrect: q.type === 'MCQ' ? answersJson[q.id] === q.correctAnswer : null,
      explanation: q.explanation ?? null,
    }));

    return { attempt, results, percentage, passed };
  }

  async getQuizAttempts(studentId: string, lessonId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { studentId, lessonId },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true, autoScore: true, finalScore: true, maxScore: true,
        passed: true, isFullyGraded: true, submittedAt: true,
      },
    });
  }

  // ── Enrollment ────────────────────────────────────────────

  async enrollStudent(studentId: string, courseId: string, wpUserId?: number) {
    const result = await this.prisma.courseEnrollment.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      update: {},
      create: { studentId, courseId },
    });
    await this.gamification.awardOnce(studentId, 'ENROLLMENT', courseId);

    // For WordPress-sourced courses, also enroll the user in the WP LMS (non-blocking)
    if (wpUserId && wpUserId > 0) {
      const course = await this.prisma.platformCourse.findUnique({
        where: { id: courseId },
        select: { source: true, wpCourseId: true },
      });
      if (course?.source === CourseSource.WORDPRESS && course.wpCourseId) {
        this.wp.enrollUserInCourse(wpUserId, course.wpCourseId).catch((err) => {
          this.logger.warn(`WP enroll fire-and-forget failed: ${err.message}`);
        });
      }
    }

    return result;
  }

  // ── Onboarding ────────────────────────────────────────────

  async saveOnboarding(userId: string, dto: {
    programmeIds: string[];
    levelId?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    countryId?: string;
  }) {
    const { programmeIds, levelId, firstName, lastName, phone, countryId } = dto;

    // Country drives rep commission + analytics; WP-imported students arrive without one
    const profile = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { countryId: true } });
    if (countryId) {
      const country = await this.prisma.country.findUnique({ where: { id: countryId }, select: { id: true } });
      if (!country) throw new BadRequestException('Selected country is invalid');
    } else if (!profile?.countryId) {
      throw new BadRequestException('Please select your country to finish setting up your account.');
    }

    if (programmeIds.length > 0) {
      const programmes = await this.prisma.programme.findMany({ where: { id: { in: programmeIds } } });
      if (programmes.length !== programmeIds.length) {
        throw new BadRequestException('One or more programme IDs are invalid');
      }
    }

    return this.prisma.userProfile.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        currentLevelId: levelId ?? null,
        ...(programmeIds.length > 0 && { programmeInterests: { set: programmeIds.map(id => ({ id })) } }),
        ...(firstName !== undefined && { firstName }),
        ...(lastName  !== undefined && { lastName }),
        ...(phone     !== undefined && { phone }),
        ...(countryId !== undefined && { countryId }),
      },
    });
  }

  // ── Course Discussion ─────────────────────────────────────

  async getDiscussions(courseId: string, lessonId: string) {
    return this.prisma.courseDiscussionPost.findMany({
      where: { courseId, lessonId, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  async postDiscussion(courseId: string, lessonId: string, authorId: string, body: string, parentId?: string) {
    return this.prisma.courseDiscussionPost.create({
      data: { courseId, lessonId, authorId, body, parentId: parentId ?? null },
      include: {
        author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        replies: { include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });
  }

  async deleteDiscussionPost(postId: string, actorId: string, actorRole: string) {
    const post = await this.prisma.courseDiscussionPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== actorId && actorRole !== UserRole.ADMIN && actorRole !== UserRole.TEACHER) {
      throw new ForbiddenException('Cannot delete this post');
    }
    await this.prisma.courseDiscussionPost.deleteMany({ where: { parentId: postId } });
    return this.prisma.courseDiscussionPost.delete({ where: { id: postId } });
  }

  // ── Single-course pricing ───────────────────────────────────

  private validPrice(amount: unknown, currency: unknown) {
    const a = Number(amount);
    const c = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
    if (!Number.isInteger(a) || a <= 0) throw new BadRequestException('Price must be a whole number above zero (in minor units)');
    if (!/^[A-Z]{3}$/.test(c)) throw new BadRequestException('Currency must be a 3-letter code such as GHS or XAF');
    return { amount: a, currency: c };
  }

  /** The course's teacher proposes a single-course price; an admin approves it before it goes live. */
  async proposePrice(courseId: string, actor: UserProfile, dto: { amount: number; currency: string }) {
    await this.assertCourseAccess(courseId, actor);
    const { amount, currency } = this.validPrice(dto?.amount, dto?.currency);
    return this.prisma.platformCourse.update({
      where: { id: courseId },
      data: { proposedPriceAmount: amount, proposedPriceCurrency: currency, priceProposedAt: new Date() },
      select: { id: true, proposedPriceAmount: true, proposedPriceCurrency: true, priceProposedAt: true },
    });
  }

  /** Admin decides on a proposal; approving can use the proposed price or a different one. */
  async decidePrice(courseId: string, dto: { approve: boolean; amount?: number; currency?: string }) {
    const course = await this.prisma.platformCourse.findUnique({
      where: { id: courseId },
      select: { proposedPriceAmount: true, proposedPriceCurrency: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    const clear = { proposedPriceAmount: null, proposedPriceCurrency: null, priceProposedAt: null };
    const owner = await this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { teacherId: true, title: true } });
    if (!dto?.approve) {
      this.notifications.notify(owner!.teacherId, {
        type: 'system', title: 'Price not approved', body: `Your proposed price for "${owner!.title}" was not approved. The course stays in its packages.`,
        href: `/teacher/courses/${courseId}/pricing`,
      });
      return this.prisma.platformCourse.update({ where: { id: courseId }, data: clear, select: { id: true } });
    }
    const { amount, currency } = this.validPrice(dto.amount ?? course.proposedPriceAmount, dto.currency ?? course.proposedPriceCurrency);
    this.notifications.notify(owner!.teacherId, {
      type: 'system', title: 'Course price approved', body: `"${owner!.title}" can now be bought on its own.`,
      href: `/teacher/courses/${courseId}/pricing`,
    });
    return this.prisma.platformCourse.update({
      where: { id: courseId },
      data: { ...clear, priceAmount: amount, priceCurrency: currency, isSoldIndividually: true },
      select: { id: true, priceAmount: true, priceCurrency: true, isSoldIndividually: true },
    });
  }

  /** Admin sets (or stops) single-course sales on many courses at once. */
  async bulkPrice(dto: { courseIds: string[]; sell: boolean; amount?: number; currency?: string }) {
    const ids = Array.isArray(dto?.courseIds) ? dto.courseIds.filter(i => typeof i === 'string').slice(0, 500) : [];
    if (!ids.length) throw new BadRequestException('Choose at least one course');
    if (!dto.sell) {
      const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { isSoldIndividually: false } });
      return { updated: r.count };
    }
    const { amount, currency } = this.validPrice(dto.amount, dto.currency);
    const r = await this.prisma.platformCourse.updateMany({
      where: { id: { in: ids } },
      data: { priceAmount: amount, priceCurrency: currency, isSoldIndividually: true },
    });
    return { updated: r.count };
  }

  listPriceDefaults() {
    return this.prisma.coursePriceDefault.findMany({
      include: { programme: { select: { id: true, name: true, shortName: true } } },
      orderBy: [{ programmeId: 'asc' }, { currency: 'asc' }],
    });
  }

  /** Replace the default price table. Each row: programme (none = every programme), currency, amount in minor units. */
  async setPriceDefaults(rows: { programmeId?: string | null; currency: string; amount: number }[]) {
    const clean = (Array.isArray(rows) ? rows : []).map(r => ({ programmeId: r.programmeId || null, ...this.validPrice(r.amount, r.currency) }));
    await this.prisma.$transaction([
      this.prisma.coursePriceDefault.deleteMany({}),
      ...clean.map(r => this.prisma.coursePriceDefault.create({ data: r })),
    ]);
    return this.listPriceDefaults();
  }

  /**
   * Put package-only published courses on sale at their programme's default price in one currency
   * (a programme-specific default wins over the every-programme one). Courses already on sale are left alone.
   */
  async applyPriceDefaults(currency: string, courseIds?: string[]) {
    const cur = String(currency ?? '').toUpperCase();
    const defaults = await this.prisma.coursePriceDefault.findMany({ where: { currency: cur } });
    if (!defaults.length) throw new BadRequestException(`Set a default price in ${cur || 'a currency'} first`);
    const byProgramme = new Map(defaults.map(d => [d.programmeId, d.amount]));
    const courses = await this.prisma.platformCourse.findMany({
      where: { status: 'PUBLISHED', isSoldIndividually: false, ...(courseIds?.length ? { id: { in: courseIds } } : {}) },
      select: { id: true, programmeId: true },
    });
    let updated = 0;
    for (const c of courses) {
      const amount = (c.programmeId ? byProgramme.get(c.programmeId) : undefined) ?? byProgramme.get(null);
      if (!amount) continue;
      await this.prisma.platformCourse.update({ where: { id: c.id }, data: { priceAmount: amount, priceCurrency: cur, isSoldIndividually: true } });
      updated++;
    }
    return { updated, skipped: courses.length - updated };
  }

  /** The teacher's commission on this course (from their course assignment), for the pricing screen. */
  async teacherShare(courseId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    const a = await this.prisma.courseAssignment.findUnique({ where: { courseId }, select: { teacherCommissionPct: true } });
    return { teacherCommissionPct: a?.teacherCommissionPct ?? null };
  }

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Students never receive the address of a video in our bucket (it would work forever and can be
   * shared); they get a placeholder and fetch a short-lived signed link from /signed-video instead.
   */
  private hideStoredVideo<L extends { videoUrl: string | null; videoUrlLow?: string | null }>(l: L) {
    const stored = this.files.isOwnFile(l.videoUrl);
    return {
      ...l,
      videoUrl: stored ? STORED_VIDEO : l.videoUrl,
      videoUrlLow: null,
      hasDataSaver: !!l.videoUrlLow,
    };
  }

  private async assertCourseAccess(courseId: string, actor: UserProfile) {
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    const isAdmin = (actor.role as UserRole) === UserRole.ADMIN;
    if (!isAdmin && course.teacherId !== actor.id) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return course;
  }

  /** Whether a student may open a published course's paid lessons. Mirrors the portal's access rules. */
  async studentHasCourseAccess(studentId: string, courseId: string): Promise<boolean> {
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const [course, pkg, purchase, enrollment] = await Promise.all([
      this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { status: true } }),
      this.prisma.packagePurchase.findFirst({ where: { studentId, ...active, package: { courseIds: { has: courseId } } }, select: { id: true } }),
      this.prisma.coursePurchase.findFirst({ where: { studentId, courseId, ...active }, select: { id: true } }),
      this.prisma.courseEnrollment.findUnique({ where: { studentId_courseId: { studentId, courseId } }, select: { id: true } }),
    ]);
    return course?.status === 'PUBLISHED' && !!(pkg || purchase || enrollment);
  }

  /**
   * For student actions on a lesson: the lesson must belong to the course, and the student needs
   * course access unless the lesson is a free preview.
   */
  private async assertStudentLesson(studentId: string, courseId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, module: { courseId } } });
    if (!lesson) throw new NotFoundException('Lesson not found in this course');
    if (!lesson.isFree && !(await this.studentHasCourseAccess(studentId, courseId))) {
      throw new ForbiddenException('You need access to this course');
    }
    return lesson;
  }

  /**
   * A lesson as seen by someone studying or previewing it: students need access (or a free preview),
   * teachers only see their own courses, admins see everything. Includes course and module titles.
   */
  async lessonForViewer(viewer: UserProfile, courseId: string, lessonId: string) {
    const role = viewer.role as UserRole;
    if (role === UserRole.STUDENT) await this.assertStudentLesson(viewer.id, courseId, lessonId);
    else if (role === UserRole.ADMIN || role === UserRole.TEACHER) await this.assertCourseAccess(courseId, viewer);
    else throw new ForbiddenException('You do not have access to this lesson');
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId } },
      include: { module: { select: { title: true, course: { select: { title: true } } } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found in this course');
    return lesson;
  }

  /** A lesson the actor may edit (course teacher or admin), with its course id. */
  async lessonForEditor(actor: UserProfile, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCourseAccess(lesson.module.courseId, actor);
    return lesson;
  }
}

/** Placeholder sent to students instead of a stored video's address. */
const STORED_VIDEO = 'stored-video';

function courseIncludes() {
  return {
    programme:  { select: { id: true, name: true, shortName: true, type: true } },
    subject:    { select: { id: true, name: true, category: true } },
    level:      { select: { id: true, name: true, tier: true } },
    teacher:    { select: { id: true, email: true } },
    modules: {
      orderBy: { sortOrder: 'asc' as const },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' as const },
          include: { attachments: true },
        },
      },
    },
  };
}

/**
 * Accept chapters as [{ startSec, title }] (or { start/time, title }) and return a clean, sorted,
 * de-duplicated list — or null when empty. Rejects anything that isn't a list of chapters.
 */
function normaliseChapters(raw: unknown): { startSec: number; title: string }[] | null {
  if (raw == null || raw === '') return null;
  if (!Array.isArray(raw)) throw new BadRequestException('chapters must be a list of { startSec, title }');
  const seen = new Set<number>();
  const chapters = raw
    .map((c: any) => ({
      startSec: Math.max(0, Math.floor(Number(c?.startSec ?? c?.start ?? c?.time))),
      title: String(c?.title ?? '').trim().slice(0, 120),
    }))
    .filter(c => Number.isFinite(c.startSec) && c.title && !seen.has(c.startSec) && seen.add(c.startSec))
    .sort((a, b) => a.startSec - b.startSec)
    .slice(0, 100);
  return chapters.length ? chapters : null;
}
