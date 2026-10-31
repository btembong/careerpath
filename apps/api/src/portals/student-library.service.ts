import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type Access =
  | { kind: 'package'; packageId: string; name: string; expiresAt: Date | null }
  | { kind: 'single'; expiresAt: Date | null; purchasedAt: Date }
  | { kind: 'free'; expiresAt: null }
  | { kind: 'website'; expiresAt: null };

const DAY = 86_400_000;
/** Later expiry wins; no expiry beats any date */
const better = (a: Access, b: Access) => (a.expiresAt === null ? a : b.expiresAt === null ? b : a.expiresAt > b.expiresAt ? a : b);

@Injectable()
export class StudentLibraryService {
  constructor(private prisma: PrismaService) {}

  /** Every course the student can open, where the access comes from, and how far they are */
  async library(studentId: string) {
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const [pkgBuys, courseBuys, enrollments] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { studentId, ...active }, include: { package: { select: { id: true, name: true, courseIds: true } } } }),
      this.prisma.coursePurchase.findMany({ where: { studentId, ...active }, select: { courseId: true, amountPaid: true, expiresAt: true, purchasedAt: true } }),
      this.prisma.courseEnrollment.findMany({ where: { studentId }, select: { courseId: true, course: { select: { source: true, isSoldIndividually: true, priceAmount: true } } } }),
    ]);

    const access = new Map<string, Access>();
    const give = (courseId: string, a: Access) => { const cur = access.get(courseId); access.set(courseId, cur ? better(cur, a) : a); };
    pkgBuys.forEach(p => p.package.courseIds.forEach(id => give(id, { kind: 'package', packageId: p.package.id, name: p.package.name, expiresAt: p.expiresAt })));
    courseBuys.forEach(c => give(c.courseId, c.amountPaid > 0 ? { kind: 'single', expiresAt: c.expiresAt, purchasedAt: c.purchasedAt } : { kind: 'free', expiresAt: null }));
    enrollments.forEach(e => {
      if (e.course.source === 'WORDPRESS') give(e.courseId, { kind: 'website', expiresAt: null });
      else if (e.course.isSoldIndividually && !e.course.priceAmount) give(e.courseId, { kind: 'free', expiresAt: null });
    });

    const ids = [...access.keys()];
    if (!ids.length) return { stats: { courses: 0, packages: 0, single: 0, free: 0, lessonsThisWeek: 0, studySecs30d: 0, certificates: 0 }, resume: null, courses: [] };

    const [courses, progress, certs] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { id: { in: ids }, status: 'PUBLISHED' },
        select: {
          id: true, title: true, coverUrl: true, source: true, wpCourseUrl: true, contentImportedAt: true,
          programme: { select: { name: true, shortName: true } },
          teacher: { select: { name: true, firstName: true, lastName: true } },
          modules: { orderBy: { sortOrder: 'asc' }, select: { title: true, sortOrder: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, type: true, durationSecs: true } } } },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { studentId, lesson: { module: { courseId: { in: ids } } } },
        select: { lessonId: true, completed: true, updatedAt: true, watchedSecs: true },
      }),
      this.prisma.certificate.findMany({ where: { studentId, courseId: { in: ids } }, select: { id: true, courseId: true, verifyCode: true, pdfUrl: true, issuedAt: true } }),
    ]);
    const byLesson = new Map(progress.map(p => [p.lessonId, p]));

    const rows = courses.map(c => {
      const lessons = c.modules.flatMap((m, mi) => m.lessons.map(l => ({ ...l, moduleTitle: m.title, moduleNo: mi + 1 })));
      const done = lessons.filter(l => byLesson.get(l.id)?.completed).length;
      const opened = lessons.map(l => byLesson.get(l.id)?.updatedAt).filter(Boolean) as Date[];
      const lastOpened = opened.length ? new Date(Math.max(...opened.map(d => d.getTime()))) : null;
      const next = lessons.find(l => !byLesson.get(l.id)?.completed) ?? null;
      const cert = certs.find(x => x.courseId === c.id) ?? null;
      const complete = (lessons.length > 0 && done === lessons.length) || !!cert;
      const a = access.get(c.id)!;
      return {
        id: c.id, title: c.title, coverUrl: c.coverUrl, source: c.source, wpCourseUrl: c.wpCourseUrl, contentImportedAt: c.contentImportedAt,
        programme: c.programme ? c.programme.shortName ?? c.programme.name : null,
        teacher: c.teacher.name || [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') || null,
        lessons: lessons.length, done, pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
        state: complete ? 'done' : done > 0 || lastOpened ? 'going' : 'new',
        lastOpened,
        next: next ? { id: next.id, title: next.title, type: next.type, durationSecs: next.durationSecs, module: `Module ${next.moduleNo} · ${next.moduleTitle}` } : null,
        access: a,
        endsInDays: a.expiresAt ? Math.ceil((a.expiresAt.getTime() - now.getTime()) / DAY) : null,
        certificate: cert,
      };
    }).sort((x, y) => (y.lastOpened?.getTime() ?? 0) - (x.lastOpened?.getTime() ?? 0) || x.title.localeCompare(y.title));

    const resume = rows.find(r => r.state === 'going' && r.next) ?? null;
    const weekAgo = now.getTime() - 7 * DAY, monthAgo = now.getTime() - 30 * DAY;
    const kinds = new Set(pkgBuys.map(p => p.package.id));
    return {
      stats: {
        courses: rows.length,
        packages: kinds.size,
        single: rows.filter(r => r.access.kind === 'single').length,
        free: rows.filter(r => r.access.kind === 'free' || r.access.kind === 'website').length,
        lessonsDone: progress.filter(p => p.completed).length,
        lessonsThisWeek: progress.filter(p => p.completed && p.updatedAt.getTime() > weekAgo).length,
        // Seconds watched on lessons touched in the last 30 days (an estimate — totals aren't kept per day)
        studySecs30d: progress.filter(p => p.updatedAt.getTime() > monthAgo).reduce((n, p) => n + p.watchedSecs, 0),
        certificates: certs.length,
        latestCertificate: certs.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())[0]?.courseId ?? null,
      },
      resume: resume ? { id: resume.id, title: resume.title, pct: resume.pct, next: resume.next } : null,
      courses: rows,
    };
  }
}
