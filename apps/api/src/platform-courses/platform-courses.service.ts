import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, CourseStatus, CourseSource, UserRole } from '@prisma/client';
import { WordPressService } from '../wordpress/wordpress.service';
import { CertificatesService } from '../certificates/certificates.service';
import { FilesService } from '../files/files.service';
import * as crypto from 'crypto';

@Injectable()
export class PlatformCoursesService {
  private readonly logger = new Logger(PlatformCoursesService.name);

  constructor(
    private prisma: PrismaService,
    private certificates: CertificatesService,
    private wp: WordPressService,
    private files: FilesService,
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

  async getCourse(id: string, studentId?: string) {
    const course = await this.prisma.platformCourse.findUniqueOrThrow({
      where: { id },
      include: {
        ...courseIncludes(),
        enrollments: studentId ? { where: { studentId } } : false,
      },
    });
    return course;
  }

  async updateCourse(id: string, actor: UserProfile, dto: {
    title?: string; description?: string; coverUrl?: string;
    programmeId?: string; subjectId?: string; levelId?: string;
    teacherId?: string; status?: CourseStatus;
    priceAmount?: number | null; priceCurrency?: string | null; isSoldIndividually?: boolean;
  }) {
    await this.assertCourseAccess(id, actor);
    return this.prisma.platformCourse.update({
      where: { id },
      data: dto,
      include: courseIncludes(),
    });
  }

  async submitForReview(id: string, actor: UserProfile) {
    const course = await this.assertCourseAccess(id, actor);
    if (course.status !== CourseStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT courses can be submitted for review');
    }
    const moduleCount = await this.prisma.courseModule.count({ where: { courseId: id } });
    if (moduleCount === 0) throw new BadRequestException('Add at least one module before submitting');
    return this.prisma.platformCourse.update({
      where: { id }, data: { status: CourseStatus.PENDING_REVIEW },
    });
  }

  async publishCourse(id: string) {
    return this.prisma.platformCourse.update({
      where: { id }, data: { status: CourseStatus.PUBLISHED },
    });
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
    title?: string; videoUrl?: string; content?: string;
    durationSecs?: number; isFree?: boolean;
  }) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: dto,
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
    const result = await this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      update: { completed: true, watchedSecs: watchedSecs ?? 0 },
      create: { studentId, lessonId, completed: true, watchedSecs: watchedSecs ?? 0 },
    });

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

  async updateProgress(studentId: string, lessonId: string, watchedSecs: number) {
    return this.prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      update: { watchedSecs },
      create: { studentId, lessonId, watchedSecs, completed: false },
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

    return {
      courseId,
      totalLessons: allLessons.length,
      completedLessons: completedCount,
      percentComplete: allLessons.length ? Math.round((completedCount / allLessons.length) * 100) : 0,
      modules: course.modules.map(m => ({
        ...m,
        lessons: m.lessons.map(l => ({
          ...l,
          progress: l.progress[0] ?? null,
        })),
      })),
    };
  }

  // ── Signed video URL ──────────────────────────────────────

  /**
   * Return a short-lived signed URL for a VIDEO lesson.
   * Validates that the student is enrolled before signing.
   * Non-R2 URLs (YouTube / Vimeo) pass through unsigned.
   */
  async getSignedVideoUrl(courseId: string, lessonId: string, studentId: string): Promise<{ url: string }> {
    // Confirm enrollment
    const enrollment = await this.prisma.courseEnrollment.findFirst({
      where: { courseId, studentId },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');

    const lesson = await this.prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    if (!lesson.videoUrl) throw new NotFoundException('Lesson has no video');

    const url = await this.files.signUrl(lesson.videoUrl);
    return { url };
  }

  // ── Quiz: Questions ──────────────────────────────────────

  async getQuestions(lessonId: string, includeAnswers: boolean) {
    const questions = await this.prisma.questionBank.findMany({
      where: { lessonId },
      orderBy: { sortOrder: 'asc' },
    });
    if (includeAnswers) return questions;
    return questions.map(({ correctAnswer, ...q }) => q);
  }

  async addQuestion(courseId: string, lessonId: string, actor: UserProfile, dto: {
    questionText: string; type: string; options?: any; correctAnswer: string; explanation?: string;
  }) {
    await this.assertCourseAccess(courseId, actor);
    const last = await this.prisma.questionBank.findFirst({
      where: { lessonId }, orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.questionBank.create({
      data: {
        courseId,
        lessonId,
        questionText: dto.questionText,
        type: dto.type as any,
        options: dto.options ?? null,
        correctAnswer: dto.correctAnswer,
        explanation: dto.explanation,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async updateQuestion(courseId: string, questionId: string, actor: UserProfile, dto: {
    questionText?: string; options?: any; correctAnswer?: string; explanation?: string;
  }) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.questionBank.update({ where: { id: questionId }, data: dto });
  }

  async deleteQuestion(courseId: string, questionId: string, actor: UserProfile) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.questionBank.delete({ where: { id: questionId } });
  }

  async updateQuizConfig(courseId: string, lessonId: string, actor: UserProfile, dto: {
    passMark?: number | null; timeLimitSecs?: number | null; maxAttempts?: number; shuffleQuestions?: boolean;
  }) {
    await this.assertCourseAccess(courseId, actor);
    return this.prisma.lesson.update({ where: { id: lessonId }, data: dto });
  }

  // ── Quiz: Student submit ──────────────────────────────────

  async submitQuizAttempt(studentId: string, courseId: string, lessonId: string, answersJson: Record<string, string>) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');

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

  // ── Helpers ───────────────────────────────────────────────

  private async assertCourseAccess(courseId: string, actor: UserProfile) {
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    const isAdmin = (actor.role as UserRole) === UserRole.ADMIN;
    if (!isAdmin && course.teacherId !== actor.id) {
      throw new ForbiddenException('You do not have access to this course');
    }
    return course;
  }
}

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
