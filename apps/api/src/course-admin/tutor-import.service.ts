import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TutorClient, TutorItem, TutorLesson, TutorQuestion, TutorQuiz } from './tutor-client';
import { cleanHtml, firstImage, htmlToText } from './html-clean';
import { cleanTitle, norm } from './wp-text';

type Kind = 'text' | 'video' | 'quiz';
interface Outline { title: string; items: { title: string; kind: Kind; meta: string }[] }
export interface ImportSummary {
  modules: number; lessons: number; videos: number; quizzes: number; attachments: number; images: number;
  questions: { auto: number; teacher: number; skipped: number };
  removed: number; kept: number;
  outline: Outline[];
  /** Things an admin should look at (questions changed or not copied) */
  warnings: string[];
  /** Good to know, nothing to fix (e.g. pictures load from the website) */
  notes: string[];
}
type QuestionRow = { type: QuestionType; questionText: string; options: Prisma.InputJsonValue | typeof Prisma.DbNull; correctAnswer: string; points: number; imageUrl: string | null };

const LETTERS = 'abcdefgh';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Copies a WordPress course's content (topics, lessons, quizzes) from Tutor LMS into the portal's
 * own modules, lessons and questions, so it plays in the portal's player. Runs one course at a
 * time in the background. Re-importing updates what came from Tutor in place (matched by Tutor
 * ids), keeps anything added on the portal, and never deletes a lesson students have used.
 */
@Injectable()
export class TutorImportService implements OnModuleInit {
  private readonly logger = new Logger(TutorImportService.name);
  private working = false;

  constructor(private prisma: PrismaService, private tutor: TutorClient, private config: ConfigService) {}

  async onModuleInit() {
    // A restart mid-import: put it back in the queue
    await this.prisma.tutorImport.updateMany({ where: { status: 'RUNNING' }, data: { status: 'QUEUED', step: null } }).catch(() => {});
    setTimeout(() => this.work(), 5_000);
  }

  // ── Admin page ─────────────────────────────────────────────

  async list() {
    const courses = await this.prisma.platformCourse.findMany({
      where: { source: 'WORDPRESS', wpCourseId: { not: null }, status: { not: 'ARCHIVED' } },
      select: {
        id: true, title: true, wpCourseId: true, status: true, contentImportedAt: true, wpModifiedAt: true,
        programme: { select: { name: true, shortName: true } }, subject: { select: { name: true } },
        _count: { select: { enrollments: true, modules: true } },
      },
      orderBy: { title: 'asc' },
    });
    const runs = await this.prisma.tutorImport.findMany({ where: { courseId: { in: courses.map(c => c.id) } }, orderBy: { createdAt: 'desc' } });
    const latest = new Map<string, (typeof runs)[number]>();
    for (const r of runs) if (!latest.has(r.courseId)) latest.set(r.courseId, r);

    const rows = courses.map(c => {
      const run = latest.get(c.id);
      const s = run?.summary as unknown as ImportSummary | null | undefined;
      const changed = !!(c.contentImportedAt && c.wpModifiedAt && c.wpModifiedAt > c.contentImportedAt);
      const state = run && ['QUEUED', 'RUNNING'].includes(run.status) ? run.status.toLowerCase()
        : !c.contentImportedAt ? (run?.status === 'FAILED' ? 'failed' : 'website')
        : changed ? 'changed' : s?.warnings.length ? 'check' : 'imported';
      return {
        id: c.id, title: c.title, wpCourseId: c.wpCourseId, status: c.status,
        tag: [c.programme?.shortName ?? c.programme?.name, c.subject?.name].filter(Boolean).join(' · ') || null,
        students: c._count.enrollments, state, importedAt: c.contentImportedAt, wpModifiedAt: c.wpModifiedAt,
        counts: s ? { lessons: s.lessons, quizzes: s.quizzes } : null, warnings: s?.warnings.length ?? 0,
        run: run ? { id: run.id, status: run.status, step: run.step, error: run.error, finishedAt: run.finishedAt } : null,
      };
    });
    const queue = runs.filter(r => r.status === 'QUEUED' || r.status === 'RUNNING');
    const running = queue.find(r => r.status === 'RUNNING');
    return {
      connected: this.tutor.configured, quizzes: this.tutor.canReadQuizzes,
      rows,
      stats: {
        website: rows.filter(r => r.state === 'website' || r.state === 'failed').length,
        imported: rows.filter(r => r.importedAt).length,
        changed: rows.filter(r => r.state === 'changed').length,
        check: rows.filter(r => r.state === 'check').length,
      },
      queue: {
        waiting: queue.filter(r => r.status === 'QUEUED').length,
        running: running ? { courseId: running.courseId, title: courses.find(c => c.id === running.courseId)?.title ?? '', step: running.step, startedAt: running.startedAt } : null,
        // Done in this batch: finished since the oldest thing still queued or running was added
        done: queue.length ? runs.filter(r => r.finishedAt && r.createdAt >= queue[queue.length - 1].createdAt).length : 0,
      },
    };
  }

  async queue(adminId: string | null, courseIds: string[]) {
    if (!this.tutor.configured) throw new BadRequestException('Tutor LMS is not connected');
    const ids = [...new Set(courseIds)].slice(0, 300);
    const courses = await this.prisma.platformCourse.findMany({ where: { id: { in: ids }, source: 'WORDPRESS', wpCourseId: { not: null } }, select: { id: true, wpCourseId: true } });
    const busy = new Set((await this.prisma.tutorImport.findMany({ where: { courseId: { in: ids }, status: { in: ['QUEUED', 'RUNNING'] } }, select: { courseId: true } })).map(r => r.courseId));
    const fresh = courses.filter(c => !busy.has(c.id));
    if (fresh.length) await this.prisma.tutorImport.createMany({ data: fresh.map(c => ({ courseId: c.id, wpCourseId: c.wpCourseId!, byId: adminId })) });
    void this.work();
    return { queued: fresh.length, alreadyQueued: courses.length - fresh.length };
  }

  /** Stop after the course being imported now */
  async cancel() {
    const r = await this.prisma.tutorImport.updateMany({ where: { status: 'QUEUED' }, data: { status: 'CANCELLED', finishedAt: new Date() } });
    return { cancelled: r.count };
  }

  async result(courseId: string) {
    const run = await this.prisma.tutorImport.findFirst({ where: { courseId }, orderBy: { createdAt: 'desc' } });
    if (!run) throw new NotFoundException('This course has not been imported');
    const [course, by] = await Promise.all([
      this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { id: true, title: true, contentImportedAt: true, wpCourseUrl: true, modules: { select: { lessons: { select: { id: true }, orderBy: { sortOrder: 'asc' }, take: 1 } }, orderBy: { sortOrder: 'asc' }, take: 1 } } }),
      run.byId ? this.prisma.userProfile.findUnique({ where: { id: run.byId }, select: { name: true, firstName: true, email: true } }) : null,
    ]);
    return {
      course: course && { id: course.id, title: course.title, importedAt: course.contentImportedAt, wpCourseUrl: course.wpCourseUrl, firstLessonId: course.modules[0]?.lessons[0]?.id ?? null },
      run: { id: run.id, status: run.status, step: run.step, error: run.error, createdAt: run.createdAt, finishedAt: run.finishedAt, by: by ? by.name || by.firstName || by.email : null },
      summary: run.summary as unknown as ImportSummary | null,
    };
  }

  // ── Worker ─────────────────────────────────────────────────

  private async work() {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const run = await this.prisma.tutorImport.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
        if (!run) break;
        const claimed = await this.prisma.tutorImport.updateMany({ where: { id: run.id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date(), step: 'Reading the course outline' } });
        if (!claimed.count) continue;
        try {
          const summary = await this.importCourse(run.id, run.courseId, run.wpCourseId);
          await this.prisma.tutorImport.update({ where: { id: run.id }, data: { status: 'DONE', step: null, summary: summary as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          this.logger.warn(`Tutor import of course ${run.courseId} failed: ${msg}`);
          await this.prisma.tutorImport.update({ where: { id: run.id }, data: { status: 'FAILED', step: null, error: msg.slice(0, 500), finishedAt: new Date() } });
        }
      }
    } finally {
      this.working = false;
    }
  }

  private step(runId: string, step: string) {
    return this.prisma.tutorImport.update({ where: { id: runId }, data: { step } }).catch(() => {});
  }

  // ── One course ─────────────────────────────────────────────

  async importCourse(runId: string, courseId: string, wpCourseId: number): Promise<ImportSummary> {
    const warnings: string[] = [];
    const topics = await this.tutor.courseContents(wpCourseId);
    if (!Array.isArray(topics)) throw new Error('Tutor did not return an outline for this course');

    // Lesson details (video, attachments) come per topic
    const lessonInfo = new Map<number, TutorLesson>();
    for (const [i, t] of topics.entries()) {
      if (!t.contents?.some(x => x.post_type === 'lesson')) continue;
      await this.step(runId, `Reading lessons (topic ${i + 1} of ${topics.length})`);
      for (const l of await this.tutor.lessons(t.id)) lessonInfo.set(Number(l.ID), l);
    }

    const quizItems = topics.flatMap(t => t.contents ?? []).filter(x => x.post_type === 'tutor_quiz');
    const quizzes = new Map<number, TutorQuiz>();
    if (quizItems.length && !this.tutor.canReadQuizzes) warnings.push(`${plural(quizItems.length, 'quiz')} not copied: quizzes need the WordPress login (TUTOR_WP_USERNAME and TUTOR_WP_PASSWORD).`);
    else for (const [i, q] of quizItems.entries()) {
      await this.step(runId, `Reading quizzes (${i + 1} of ${quizItems.length})`);
      quizzes.set(Number(q.ID), await this.tutor.quiz(Number(q.ID)));
    }

    await this.step(runId, 'Saving to the portal');
    const site = this.config.get<string>('WP_BASE_URL')?.replace(/\/$/, '') ?? '';
    const s: ImportSummary = { modules: 0, lessons: 0, videos: 0, quizzes: 0, attachments: 0, images: 0, questions: { auto: 0, teacher: 0, skipped: 0 }, removed: 0, kept: 0, outline: [], warnings, notes: [] };

    await this.prisma.$transaction(async tx => {
      const existingModules = await tx.courseModule.findMany({ where: { courseId }, include: { lessons: { select: { id: true, wpItemId: true } } } });
      const moduleByTopic = new Map(existingModules.filter(m => m.wpTopicId != null).map(m => [m.wpTopicId!, m]));
      const lessonByItem = new Map(existingModules.flatMap(m => m.lessons).filter(l => l.wpItemId != null).map(l => [l.wpItemId!, l]));
      const seenItems = new Set<number>(), seenTopics = new Set<number>();

      for (const [ti, topic] of topics.entries()) {
        const title = cleanTitle(topic.title);
        const mod = moduleByTopic.get(Number(topic.id));
        const moduleId = mod
          ? (await tx.courseModule.update({ where: { id: mod.id }, data: { title, sortOrder: ti } })).id
          : (await tx.courseModule.create({ data: { courseId, title, sortOrder: ti, wpTopicId: Number(topic.id) } })).id;
        seenTopics.add(Number(topic.id));
        s.modules++;
        const outline: Outline = { title, items: [] };

        const items = [...(topic.contents ?? [])].sort((a, b) => a.menu_order - b.menu_order);
        for (const [ii, item] of items.entries()) {
          const id = Number(item.ID);
          if (item.post_type === 'lesson') {
            const data = this.lessonData(item, lessonInfo.get(id), site);
            s.images += (data.content?.match(/<img /g) ?? []).length;
            const lesson = await this.upsertLesson(tx, lessonByItem.get(id)?.id, { ...data.lesson, moduleId, sortOrder: ii, wpItemId: id });
            await this.replaceAttachments(tx, lesson, data.attachments, site);
            seenItems.add(id);
            s.lessons++; if (data.lesson.type === 'VIDEO') s.videos++; s.attachments += data.attachments.length;
            outline.items.push({ title: data.lesson.title, kind: data.lesson.type === 'VIDEO' ? 'video' : 'text', meta: [data.lesson.type === 'VIDEO' ? 'video' : 'text', (data.content?.match(/<img /g) ?? []).length ? plural((data.content!.match(/<img /g) ?? []).length, 'picture') : null, data.attachments.length ? plural(data.attachments.length, 'attachment') : null].filter(Boolean).join(' · ') });
          } else if (item.post_type === 'tutor_quiz') {
            const quiz = quizzes.get(id);
            if (!quiz) continue;
            const settings = quiz.quiz_settings?.[0] ?? {};
            const title = cleanTitle(quiz.post_title || item.post_title);
            const timeValue = Number(settings.time_limit?.time_value) || 0;
            const unit: Record<string, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86_400, weeks: 604_800 };
            const lesson = await this.upsertLesson(tx, lessonByItem.get(id)?.id, {
              moduleId, sortOrder: ii, wpItemId: id, title, type: 'QUIZ', content: cleanHtml(quiz.post_content) || null, videoUrl: null,
              passMark: Number(settings.passing_grade) || null,
              maxAttempts: settings.limit_attempts_allowed === '1' ? Math.max(0, Number(settings.attempts_allowed) || 0) : 0,
              timeLimitSecs: timeValue ? timeValue * (unit[settings.time_limit?.time_type] ?? 60) : null,
              shuffleQuestions: settings.questions_order === 'rand',
            });
            seenItems.add(id);
            const q = await this.saveQuestions(tx, courseId, lesson, quiz, title, warnings);
            s.quizzes++; s.questions.auto += q.auto; s.questions.teacher += q.teacher; s.questions.skipped += q.skipped;
            outline.items.push({ title, kind: 'quiz', meta: [q.auto ? `${q.auto} auto-marked` : null, q.teacher ? `${q.teacher} marked by the teacher` : null, settings.passing_grade ? `pass ${settings.passing_grade}%` : null].filter(Boolean).join(' · ') || 'no questions' });
          }
          // Assignments and other Tutor items aren't part of the portal's lessons yet
          else if (!['lesson', 'tutor_quiz'].includes(item.post_type)) {
            warnings.push(`“${cleanTitle(item.post_title)}” (${item.post_type.replace(/^tutor_/, '').replace(/_/g, ' ')}) was not copied — add it on the portal if it’s needed.`);
          }
        }
        s.outline.push(outline);
      }

      // Things removed from Tutor since the last import: delete unless students have used them
      for (const [itemId, l] of lessonByItem) {
        if (seenItems.has(itemId)) continue;
        const used = await tx.lessonProgress.count({ where: { lessonId: l.id } }) + await tx.quizAttempt.count({ where: { lessonId: l.id } }) + await tx.practiceAttempt.count({ where: { lessonId: l.id } });
        if (used) { s.kept++; continue; }
        await tx.lesson.delete({ where: { id: l.id } });
        s.removed++;
      }
      for (const m of existingModules) {
        if (m.wpTopicId == null || seenTopics.has(m.wpTopicId)) continue;
        if (!(await tx.lesson.count({ where: { moduleId: m.id } }))) await tx.courseModule.delete({ where: { id: m.id } });
      }
      // Modules added on the portal go after the imported ones
      const native = existingModules.filter(m => m.wpTopicId == null).sort((a, b) => a.sortOrder - b.sortOrder);
      for (const [i, m] of native.entries()) await tx.courseModule.update({ where: { id: m.id }, data: { sortOrder: topics.length + i } });

      await tx.platformCourse.update({ where: { id: courseId }, data: { contentImportedAt: new Date() } });
    }, { timeout: 180_000, maxWait: 20_000 });

    if (s.kept) s.notes.push(`${plural(s.kept, 'lesson')} removed on the website ${s.kept === 1 ? 'was' : 'were'} kept because students have started ${s.kept === 1 ? 'it' : 'them'}.`);
    if (s.images) s.notes.push(`${plural(s.images, 'picture')} ${s.images === 1 ? 'stays' : 'stay'} on the website (${site.replace(/^https?:\/\//, '')}) and show in the portal from there.`);
    if (!s.lessons && !s.quizzes) s.notes.push('Tutor has no lessons or quizzes for this course yet.');
    return s;
  }

  private upsertLesson(tx: Prisma.TransactionClient, id: string | undefined, data: Prisma.LessonUncheckedCreateInput) {
    return id ? tx.lesson.update({ where: { id }, data }) : tx.lesson.create({ data });
  }

  private lessonData(item: TutorItem, info: TutorLesson | undefined, site: string) {
    const content = cleanHtml(info?.post_content ?? item.post_content) || null;
    const video = this.videoOf(info?.video);
    const attachments = (Array.isArray(info?.attachments) ? info!.attachments : [])
      .map((a: any) => ({ name: cleanTitle(a?.title || a?.name || 'Attachment'), url: String(a?.url ?? a?.guid ?? ''), fileType: a?.ext ? String(a.ext).toLowerCase() : null }))
      .filter((a: { url: string }) => /^https?:\/\//.test(a.url));
    return {
      content, attachments,
      lesson: { title: cleanTitle(info?.post_title ?? item.post_title), type: (video ? 'VIDEO' : 'TEXT') as 'VIDEO' | 'TEXT', content, videoUrl: video?.url ?? null, durationSecs: video?.secs ?? null } as const,
    };
  }

  /** Tutor's lesson video: YouTube, Vimeo, an external link, or an embed code */
  private videoOf(raw: any): { url: string; secs: number | null } | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v || typeof v !== 'object') return null;
    const src = String(v.source ?? '').replace(/^source_/, '');
    const pick = [v[`source_${src}`], v.source_youtube, v.source_vimeo, v.source_external_url].find(x => typeof x === 'string' && /^https?:\/\//.test(x.trim()));
    let url: string | null = pick ? String(pick).trim() : null;
    if (!url && typeof v.source_embedded === 'string') url = v.source_embedded.match(/src=["'](https?:\/\/[^"']+)["']/i)?.[1] ?? null;
    if (!url) return null;
    const rt = v.runtime ?? {};
    const secs = (Number(rt.hours) || 0) * 3600 + (Number(rt.minutes) || 0) * 60 + (Number(rt.seconds) || 0);
    return { url, secs: secs || null };
  }

  /** Attachments from the website are replaced; ones a teacher uploaded on the portal stay */
  private async replaceAttachments(tx: Prisma.TransactionClient, lesson: { id: string }, list: { name: string; url: string; fileType: string | null }[], site: string) {
    const host = site.replace(/^https?:\/\//, '');
    await tx.lessonAttachment.deleteMany({ where: { lessonId: lesson.id, OR: [{ url: { contains: `//${host}/` } }, { url: { in: list.map(a => a.url) } }] } });
    if (list.length) await tx.lessonAttachment.createMany({ data: list.map(a => ({ lessonId: lesson.id, ...a })) });
  }

  private async saveQuestions(tx: Prisma.TransactionClient, courseId: string, lesson: { id: string }, quiz: TutorQuiz, quizTitle: string, warnings: string[]) {
    const existing = await tx.questionBank.findMany({ where: { lessonId: lesson.id, wpQuestionId: { not: null } }, select: { id: true, wpQuestionId: true } });
    const byWp = new Map(existing.map(q => [q.wpQuestionId!, q.id]));
    const seen = new Set<number>();
    const out = { auto: 0, teacher: 0, skipped: 0 };
    for (const [i, q] of (quiz.quiz_questions ?? []).entries()) {
      const mapped = this.question(q, i + 1, quizTitle, warnings);
      if (!mapped) { out.skipped++; continue; }
      const wpId = Number(q.question_id);
      seen.add(wpId);
      const data = { ...mapped, sortOrder: i, lessonId: lesson.id, courseId, wpQuestionId: wpId };
      const id = byWp.get(wpId);
      if (id) await tx.questionBank.update({ where: { id }, data });
      else await tx.questionBank.create({ data });
      if (mapped.type === 'WRITTEN') out.teacher++; else out.auto++;
    }
    // Questions removed in Tutor: delete unless students have answered them
    for (const [wpId, id] of byWp) {
      if (seen.has(wpId)) continue;
      if (await tx.quizAttemptAnswer.count({ where: { questionId: id } })) continue;
      await tx.questionBank.delete({ where: { id } });
    }
    return out;
  }

  /** Tutor question → portal question; null when the type can't be represented */
  private question(q: TutorQuestion, n: number, quizTitle: string, warnings: string[]): QuestionRow | null {
    const title = cleanTitle(q.question_title);
    const desc = htmlToText(q.question_description);
    const text = (desc && norm(desc).includes(norm(title)) ? desc : desc ? `${title}\n${desc}` : title).slice(0, 2000);
    const points = Math.min(100, Math.max(1, Math.round(Number(q.question_mark) || 1)));
    const base = { questionText: text, points, imageUrl: firstImage(q.question_description) };
    const where = `“${quizTitle}”, question ${n}`;
    const answers = [...(q.question_answers ?? [])].sort((a, b) => Number(a.answer_order) - Number(b.answer_order));

    switch (q.question_type) {
      case 'true_false':
      case 'single_choice':
      case 'multiple_choice': {
        if (!answers.length) { warnings.push(`${where} has no answers in Tutor — copied as a written question.`); return { ...base, type: 'WRITTEN', options: Prisma.DbNull, correctAnswer: '' }; }
        if (answers.length > LETTERS.length) warnings.push(`${where} has ${answers.length} choices; the portal shows the first ${LETTERS.length}.`);
        const choices = answers.slice(0, LETTERS.length);
        const options = choices.map((a, i) => ({ id: LETTERS[i], text: cleanTitle(a.answer_title) === 'Untitled' ? `Choice ${LETTERS[i].toUpperCase()} (a picture on the website)` : cleanTitle(a.answer_title) }));
        if (choices.some(a => a.answer_view_format?.includes('image') && Number(a.image_id))) warnings.push(`${where} uses pictures as choices — check the wording on the portal.`);
        const right = choices.map((a, i) => (a.is_correct === '1' ? LETTERS[i] : null)).filter((x): x is string => !!x);
        if (!right.length) { warnings.push(`${where} has no right answer marked in Tutor — copied as a written question for the teacher to mark.`); return { ...base, type: 'WRITTEN', options: Prisma.DbNull, correctAnswer: '' }; }
        if (right.length > 1) warnings.push(`${where} had ${right.length} right answers; the portal’s multiple choice takes one, so we kept the first.`);
        return { ...base, type: 'MCQ', options, correctAnswer: right[0] };
      }
      case 'fill_in_the_blank': {
        const a = answers[0];
        const gaps = (a?.answer_two_gap_match ?? '').split('|').map(x => x.trim()).filter(Boolean);
        const sentence = htmlToText(a?.answer_title ?? '').replace(/\{dash\}/g, '_____');
        const withSentence = sentence ? `${title}\n${sentence}`.slice(0, 2000) : text;
        if (gaps.length === 1) return { ...base, questionText: withSentence, type: 'SHORT_ANSWER', options: Prisma.DbNull, correctAnswer: gaps[0] };
        warnings.push(`${where} has ${gaps.length || 'no'} blanks; copied as a written question for the teacher to mark.`);
        return { ...base, questionText: withSentence, type: 'WRITTEN', options: Prisma.DbNull, correctAnswer: gaps.join(' / ') };
      }
      case 'short_answer':
      case 'open_ended':
        return { ...base, type: 'WRITTEN', options: Prisma.DbNull, correctAnswer: '' };
      default:
        warnings.push(`${where} is a ${q.question_type.replace(/_/g, ' ')} question, which the portal doesn’t have yet — not copied.`);
        return null;
    }
  }
}
