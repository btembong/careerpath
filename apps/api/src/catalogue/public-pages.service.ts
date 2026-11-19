import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
type Selling = 'free' | 'paid' | 'package' | 'notsale';

/** "wassce-core-mathematics-complete-revision-9487f25c-…": readable, and the id at the end finds it */
export const slugOf = (title: string, id: string) =>
  `${title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '')}-${id}`;

const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null } | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || null : null;
/** Bios saved from WordPress can carry HTML entities and tags */
const clean = (s: string | null | undefined) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&rsquo;/g, '’').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const sellingOf = (c: { source: string; isSoldIndividually: boolean; priceAmount: number | null }, inPackage: boolean): Selling =>
  c.isSoldIndividually ? ((c.priceAmount ?? 0) > 0 ? 'paid' : 'free') : c.source === 'WORDPRESS' ? 'free' : inPackage ? 'package' : 'notsale';

/**
 * The public course and package pages: what a visitor sees before signing in. Only published courses that are
 * in the catalogue, and only published packages. Nothing about any student.
 */
@Injectable()
export class PublicPagesService {
  constructor(private prisma: PrismaService) {}

  private async publishedPackages() {
    return this.prisma.package.findMany({ where: { isPublished: true }, select: { id: true, name: true, priceAmount: true, currency: true, courseIds: true, validityDays: true, bestValue: true } });
  }

  async course(idOrSlug: string) {
    const id = UUID.exec(idOrSlug)?.[1];
    if (!id) throw new NotFoundException('Course not found');
    const c = await this.prisma.platformCourse.findUnique({
      where: { id },
      select: {
        id: true, title: true, shortDescription: true, description: true, outcomes: true, coverUrl: true, language: true, accessMonths: true,
        updatedAt: true, source: true, status: true, catalogueHidden: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true,
        teacherPending: true, programmeId: true, subjectId: true,
        programme: { select: { name: true, shortName: true } }, subject: { select: { name: true } }, level: { select: { name: true } },
        teacher: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, bio: true, videoIntroUrl: true, teachingSubjects: { select: { name: true } }, country: { select: { name: true } } } },
        modules: { orderBy: { sortOrder: 'asc' }, select: { title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { title: true, type: true, isFree: true, durationSecs: true } } } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!c || c.status !== 'PUBLISHED' || c.catalogueHidden) throw new NotFoundException('Course not found');

    const [packages, questions, teacherCourses, related] = await Promise.all([
      this.publishedPackages(),
      this.prisma.questionBank.count({ where: { courseId: id, status: 'LIVE' } }),
      c.teacherPending ? Promise.resolve(0) : this.prisma.platformCourse.count({ where: { teacherId: c.teacher.id, status: 'PUBLISHED', catalogueHidden: false } }),
      this.prisma.platformCourse.findMany({
        where: { id: { not: id }, status: 'PUBLISHED', catalogueHidden: false, OR: [...(c.subjectId ? [{ subjectId: c.subjectId }] : []), ...(c.programmeId ? [{ programmeId: c.programmeId }] : [])], modules: { some: {} } },
        take: 3, orderBy: { enrollments: { _count: 'desc' } },
        select: { id: true, title: true, coverUrl: true, source: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true, teacherPending: true, teacher: { select: { name: true, firstName: true, lastName: true } }, programme: { select: { shortName: true, name: true } }, subject: { select: { name: true } } },
      }),
    ]);
    const inPackages = packages.filter(p => p.courseIds.includes(id));
    const lessons = c.modules.flatMap(m => m.lessons);
    const n = (t: string) => lessons.filter(l => l.type === t).length;
    const minutes = Math.round(lessons.reduce((t, l) => t + (l.durationSecs ?? 0), 0) / 60);
    const selling = sellingOf(c, inPackages.length > 0);
    const t = c.teacherPending ? null : c.teacher;
    return {
      id: c.id, slug: slugOf(c.title, c.id), title: c.title, shortDescription: c.shortDescription, description: c.description,
      outcomes: (c.outcomes ?? []).filter(Boolean), coverUrl: c.coverUrl, language: c.language ?? 'English', accessMonths: c.accessMonths, updatedAt: c.updatedAt,
      exam: c.programme ? c.programme.shortName ?? c.programme.name : null, subject: c.subject?.name ?? null, level: c.level?.name ?? null,
      selling, price: selling === 'paid' ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null,
      students: c._count.enrollments,
      teacher: t ? { slug: (await this.teachers()).find(o => o.id === t.id)?.slug ?? null, name: nameOf(t), avatarUrl: t.avatarUrl, bio: clean(t.bio).slice(0, 600) || null, hasVideo: !!t.videoIntroUrl, subjects: t.teachingSubjects.map(s => s.name), country: t.country?.name ?? null, courses: teacherCourses } : null,
      modules: c.modules.filter(m => m.lessons.length).map(m => ({ title: m.title, lessons: m.lessons.map(l => ({ title: l.title, type: l.type, free: l.isFree, minutes: l.durationSecs ? Math.round(l.durationSecs / 60) : null })) })),
      counts: { lessons: lessons.length, videos: n('VIDEO'), notes: n('TEXT'), quizzes: n('QUIZ'), live: n('LIVE'), questions, minutes },
      packages: inPackages.map(p => ({ id: p.id, name: p.name, priceAmount: p.priceAmount, currency: p.currency, courses: p.courseIds.length, months: p.validityDays ? Math.round(p.validityDays / 30) : null })),
      related: related.map(r => ({
        slug: slugOf(r.title, r.id), title: r.title, coverUrl: r.coverUrl, exam: r.programme ? r.programme.shortName ?? r.programme.name : null, subject: r.subject?.name ?? null,
        teacher: r.teacherPending ? null : nameOf(r.teacher), selling: sellingOf(r, packages.some(p => p.courseIds.includes(r.id))),
        price: r.isSoldIndividually && (r.priceAmount ?? 0) > 0 ? { amount: r.priceAmount!, currency: r.priceCurrency! } : null,
      })),
    };
  }

  async package(id: string) {
    const p = await this.prisma.package.findUnique({ where: { id } });
    if (!p || !p.isPublished) throw new NotFoundException('Package not found');
    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: p.courseIds }, status: 'PUBLISHED' },
      select: {
        id: true, title: true, coverUrl: true, catalogueHidden: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true, teacherPending: true,
        programme: { select: { shortName: true, name: true } }, subject: { select: { name: true } },
        teacher: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true } },
        modules: { select: { lessons: { select: { type: true } } } },
      },
    });
    const ordered = p.courseIds.map(cid => courses.find(c => c.id === cid)).filter(Boolean) as typeof courses;
    const [questions, cohort] = await Promise.all([
      this.prisma.questionBank.count({ where: { courseId: { in: p.courseIds }, status: 'LIVE' } }),
      p.cohortId ? this.prisma.cohort.findUnique({ where: { id: p.cohortId }, select: { name: true, examDate: true, teacher: { select: { name: true, firstName: true, lastName: true } }, liveClasses: { where: { status: 'SCHEDULED', scheduledAt: { gt: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 4, select: { title: true, scheduledAt: true, durationMins: true } } } }) : null,
    ]);
    const teachers = new Map<string, { name: string | null; avatarUrl: string | null }>();
    for (const c of ordered) if (!c.teacherPending) teachers.set(c.teacher.id, { name: nameOf(c.teacher), avatarUrl: c.teacher.avatarUrl });
    const all = ordered.flatMap(c => c.modules.flatMap(m => m.lessons));
    // Worth on their own: only when every course has its own price in the package's currency
    const priced = ordered.every(c => c.isSoldIndividually && (c.priceAmount ?? 0) > 0 && c.priceCurrency === p.currency);
    const worth = priced && ordered.length ? ordered.reduce((t, c) => t + (c.priceAmount ?? 0), 0) : null;
    const cfg = (p.addOns ?? {}) as { live?: { cohortId: string; price: number } | null; mentorship?: { perMonth: number; price: number } | null };
    const liveAddOn = cfg.live ? await this.prisma.cohort.findUnique({ where: { id: cfg.live.cohortId }, select: { name: true } }) : null;
    const exams = [...new Set(ordered.map(c => c.programme ? c.programme.shortName ?? c.programme.name : null).filter(Boolean))] as string[];
    return {
      id: p.id, name: p.name, description: p.description, priceAmount: p.priceAmount, currency: p.currency,
      months: p.validityDays ? Math.round(p.validityDays / 30) : null, bestValue: p.bestValue, exams,
      worth: worth && worth > p.priceAmount ? worth : null,
      courses: ordered.map(c => {
        const ls = c.modules.flatMap(m => m.lessons);
        return {
          id: c.id, slug: c.catalogueHidden ? null : slugOf(c.title, c.id), title: c.title, coverUrl: c.coverUrl,
          exam: c.programme ? c.programme.shortName ?? c.programme.name : null, subject: c.subject?.name ?? null,
          teacher: c.teacherPending ? null : { name: nameOf(c.teacher), avatarUrl: c.teacher.avatarUrl },
          modules: c.modules.filter(m => m.lessons.length).length, lessons: ls.length, quizzes: ls.filter(l => l.type === 'QUIZ').length,
          price: c.isSoldIndividually && (c.priceAmount ?? 0) > 0 ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null,
        };
      }),
      teachers: [...teachers.values()],
      counts: { courses: ordered.length, ready: ordered.filter(c => c.modules.some(m => m.lessons.length)).length, lessons: all.length, videos: all.filter(l => l.type === 'VIDEO').length, quizzes: all.filter(l => l.type === 'QUIZ').length, questions },
      live: cohort ? { cohort: cohort.name, teacher: nameOf(cohort.teacher), examDate: cohort.examDate, next: cohort.liveClasses } : null,
      mentorship: p.mentorship || p.mentorshipSessionsPerMonth != null ? { text: p.mentorship, perMonth: p.mentorshipSessionsPerMonth } : null,
      addOns: {
        live: cfg.live && liveAddOn ? { price: cfg.live.price, cohort: liveAddOn.name } : null,
        mentorship: cfg.mentorship ? { price: cfg.mentorship.price, perMonth: cfg.mentorship.perMonth } : null,
      },
      faq: Array.isArray(p.faq) ? (p.faq as { q: string; a: string }[]).filter(x => x?.q && x?.a) : [],
    };
  }

  /**
   * /courses for visitors: every catalogue course with what a card needs, plus the first step to suggest
   * (the sample course) and whether any package is on sale. Sorted most joined this month first.
   */
  async list() {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [rows, packages, joined, questions, sample, featuredRow] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { status: 'PUBLISHED', catalogueHidden: false },
        select: {
          id: true, title: true, shortDescription: true, coverUrl: true, source: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true, teacherPending: true, createdAt: true,
          programme: { select: { id: true, name: true, shortName: true, countries: { select: { code: true, name: true } } } }, subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true } },
          modules: { select: { _count: { select: { lessons: true } } } },
          _count: { select: { enrollments: true } },
        },
      }),
      this.publishedPackages(),
      this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { enrolledAt: { gte: monthStart } }, _count: { _all: true } }),
      this.prisma.questionBank.groupBy({ by: ['courseId'], where: { status: 'LIVE' }, _count: { _all: true } }),
      this.prisma.platformSetting.findUnique({ where: { key: 'sampleCourse' } }),
      this.prisma.platformSetting.findUnique({ where: { key: 'publicCountries' } }),
    ]);
    const month = new Map(joined.map(j => [j.courseId, j._count._all]));
    const qs = new Map(questions.map(q => [q.courseId, q._count._all]));
    const courses = rows.map(c => {
      const lessons = c.modules.reduce((t, m) => t + m._count.lessons, 0);
      const selling = sellingOf(c, packages.some(p => p.courseIds.includes(c.id)));
      return {
        id: c.id, slug: slugOf(c.title, c.id), title: c.title, summary: c.shortDescription, coverUrl: c.coverUrl,
        exam: c.programme ? { id: c.programme.id, name: c.programme.shortName ?? c.programme.name } : null,
        // Where the course's exam is taken; an exam with no country (IELTS, ACCA) is international; no exam yet = unknown
        countries: c.programme ? c.programme.countries.map(x => x.code) : null,
        subject: c.subject, teacher: c.teacherPending ? null : { id: c.teacher.id, name: nameOf(c.teacher), avatarUrl: c.teacher.avatarUrl },
        modules: c.modules.filter(m => m._count.lessons).length, lessons, questions: qs.get(c.id) ?? 0,
        selling, price: selling === 'paid' ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null,
        // No lessons here yet: it opens on careerpathafrica.com
        website: lessons === 0, joinedThisMonth: month.get(c.id) ?? 0, students: c._count.enrollments, added: c.createdAt,
      };
    }).sort((a, b) => b.joinedThisMonth - a.joinedThisMonth || b.students - a.students || b.lessons - a.lessons);
    // The countries CareerPath serves come first and are always listed, even before they have courses
    // (platform setting publicCountries: { codes: [...] }); then every other country with courses, most first
    const byCode = new Map<string, { code: string; name: string; n: number }>();
    for (const c of rows) for (const x of c.programme?.countries ?? []) { const e = byCode.get(x.code) ?? { ...x, n: 0 }; e.n++; byCode.set(x.code, e); }
    const featured = ((featuredRow?.value ?? {}) as { codes?: string[] }).codes ?? ['CM', 'NG', 'KE', 'ZA'];
    for (const x of await this.prisma.country.findMany({ where: { code: { in: featured } }, select: { code: true, name: true } })) if (!byCode.has(x.code)) byCode.set(x.code, { ...x, n: 0 });
    const sampleId = ((sample?.value ?? {}) as { courseId?: string }).courseId;
    const best = packages.find(p => p.bestValue) ?? packages[0] ?? null;
    return {
      courses,
      start: courses.find(c => c.id === sampleId) ?? courses.find(c => c.selling === 'free' && !c.website) ?? null,
      package: best ? { id: best.id, name: best.name, priceAmount: best.priceAmount, currency: best.currency, courses: best.courseIds.length } : null,
      packages: packages.length,
      countries: [...byCode.values()].sort((a, b) => (featured.includes(a.code) ? featured.indexOf(a.code) : 99) - (featured.includes(b.code) ? featured.indexOf(b.code) : 99) || b.n - a.n || a.name.localeCompare(b.name)),
      international: courses.filter(c => c.countries && !c.countries.length).length,
    };
  }

  /** /packages for visitors: every published package, with what's in it, for choosing side by side */
  async packages() {
    const rows = await this.prisma.package.findMany({ where: { isPublished: true }, orderBy: { priceAmount: 'asc' } });
    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: [...new Set(rows.flatMap(r => r.courseIds))] }, status: 'PUBLISHED' },
      select: { id: true, title: true, coverUrl: true, programme: { select: { shortName: true, name: true } }, modules: { select: { _count: { select: { lessons: true } } } } },
    });
    return rows.map(p => {
      const cs = p.courseIds.map(id => courses.find(c => c.id === id)).filter(Boolean) as typeof courses;
      const cfg = (p.addOns ?? {}) as { live?: unknown; mentorship?: unknown };
      return {
        id: p.id, name: p.name, description: p.description, priceAmount: p.priceAmount, currency: p.currency, bestValue: p.bestValue,
        months: p.validityDays ? Math.round(p.validityDays / 30) : null,
        courses: cs.length, lessons: cs.reduce((t, c) => t + c.modules.reduce((x, m) => x + m._count.lessons, 0), 0),
        exams: [...new Set(cs.map(c => c.programme ? c.programme.shortName ?? c.programme.name : null).filter(Boolean))] as string[],
        covers: cs.filter(c => c.coverUrl).slice(0, 3).map(c => c.coverUrl),
        titles: cs.slice(0, 6).map(c => c.title),
        live: !!p.cohortId, liveAddOn: !!cfg.live, mentorship: !!p.mentorship || p.mentorshipSessionsPerMonth != null || !!cfg.mentorship,
      };
    });
  }
  /** A teacher's name for public pages: website names can carry a job title ("Ashu Kyria - Chemistry Tutor") or HTML entities */
  private publicName = (p: { name: string | null; firstName: string | null; lastName: string | null }) =>
    clean(nameOf(p) ?? 'Teacher').split(/\s+[-–—|]\s+|\s*\(/)[0].trim() || 'Teacher';
  /** Gravatar's grey silhouette is what people without a photo get from the website: show their initials instead */
  private photo = (u: string | null) => (u && !/gravatar.com/i.test(u) ? u : null);
  private nameSlug = (n: string) => slugOf(n, 'x').replace(/-x$/, '');

  private teacherWhere = { role: 'TEACHER' as const, approvalStatus: 'APPROVED' as const, wpUserId: { not: 0 } };
  private realSubjects = (xs: string[] | undefined) => (xs ?? []).filter(x => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x));

  /** /teachers for visitors: approved teachers with what a card needs. Never an email, phone or anything private. */
  async teachers() {
    const rows = await this.prisma.userProfile.findMany({
      where: this.teacherWhere,
      select: {
        id: true, name: true, firstName: true, lastName: true, avatarUrl: true, videoIntroUrl: true,
        country: { select: { code: true, name: true } },
        teacherApplication: { select: { subjectAreas: true, yearsExperience: true } },
        platformCourses: { where: { status: 'PUBLISHED', catalogueHidden: false, teacherPending: false }, select: { id: true } },
        teacherReviews: { select: { rating: true } },
      },
    });
    const list = rows.map(t => {
      const name = this.publicName(t);
      const r = t.teacherReviews.map(x => x.rating);
      return {
        id: t.id, slug: this.nameSlug(name), name, avatarUrl: this.photo(t.avatarUrl), country: t.country, hasVideo: !!t.videoIntroUrl,
        subjects: this.realSubjects(t.teacherApplication?.subjectAreas), yearsExperience: t.teacherApplication?.yearsExperience ?? null,
        courses: t.platformCourses.length,
        rating: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null, ratings: r.length,
      };
    }).sort((a, b) => Number(b.courses > 0) - Number(a.courses > 0) || Number(!!b.avatarUrl) - Number(!!a.avatarUrl) || b.courses - a.courses || a.name.localeCompare(b.name));
    // Two teachers with the same name get a few characters of their id to tell them apart
    const seen = new Map<string, number>();
    list.forEach(t => seen.set(t.slug, (seen.get(t.slug) ?? 0) + 1));
    list.forEach(t => { if ((seen.get(t.slug) ?? 0) > 1) t.slug = `${t.slug}-${t.id.slice(0, 6)}`; });
    return list;
  }

  /** One teacher's public profile: who they are, their catalogue courses, reviews (first names only) and others who teach the same subject */
  async teacher(idOrSlug: string) {
    const all = await this.teachers();
    const id = UUID.exec(idOrSlug)?.[1] ?? all.find(o => o.slug === idOrSlug.toLowerCase())?.id;
    if (!id) throw new NotFoundException('Teacher not found');
    const t = await this.prisma.userProfile.findFirst({
      where: { id, ...this.teacherWhere },
      select: {
        id: true, name: true, firstName: true, lastName: true, avatarUrl: true, bio: true, videoIntroUrl: true,
        country: { select: { code: true, name: true } },
        teacherApplication: { select: { subjectAreas: true, yearsExperience: true, qualification: true } },
        teacherReviews: { orderBy: { createdAt: 'desc' }, take: 12, select: { rating: true, comment: true, createdAt: true, student: { select: { firstName: true, name: true } } } },
        teacherCohorts: { select: { students: { select: { studentId: true } } } },
      },
    });
    if (!t) throw new NotFoundException('Teacher not found');
    const [courses, packages, ratingAgg] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { teacherId: id, status: 'PUBLISHED', catalogueHidden: false, teacherPending: false },
        orderBy: { enrollments: { _count: 'desc' } },
        select: {
          id: true, title: true, coverUrl: true, source: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true,
          programme: { select: { shortName: true, name: true } }, subject: { select: { name: true } },
          modules: { select: { _count: { select: { lessons: true } } } },
          enrollments: { select: { studentId: true } },
        },
      }),
      this.publishedPackages(),
      this.prisma.teacherReview.aggregate({ where: { teacherId: id }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    const name = this.publicName(t);
    const subjects = this.realSubjects(t.teacherApplication?.subjectAreas);
    const students = new Set([...courses.flatMap(c => c.enrollments.map(e => e.studentId)), ...t.teacherCohorts.flatMap(c => c.students.map(s => s.studentId))]).size;
    const me = all.find(o => o.id === t.id)?.slug ?? this.nameSlug(name);
    // Others who teach their first subject, with a photo first
    const others = all.filter(o => o.slug !== me && subjects.length && o.subjects.some(s => s === subjects[0]))
      .sort((a, b) => Number(!!b.avatarUrl) - Number(!!a.avatarUrl) || b.courses - a.courses).slice(0, 3);
    const years = t.teacherApplication?.yearsExperience ?? null;
    return {
      id: t.id, slug: me, name, avatarUrl: this.photo(t.avatarUrl), country: t.country, bio: clean(t.bio) || null, videoUrl: t.videoIntroUrl,
      subjects, yearsExperience: years, teachingSince: years ? new Date().getFullYear() - years : null,
      qualification: t.teacherApplication?.qualification ?? null,
      students,
      rating: ratingAgg._avg.rating ? Math.round(ratingAgg._avg.rating * 10) / 10 : null, ratings: ratingAgg._count.rating,
      reviews: t.teacherReviews.map(r => ({ rating: r.rating, comment: r.comment, at: r.createdAt, by: (r.student.firstName || (r.student.name ?? '').split(/\s+/)[0] || 'A student') })),
      courses: courses.map(c => {
        const selling = sellingOf(c, packages.some(p => p.courseIds.includes(c.id)));
        return {
          slug: slugOf(c.title, c.id), title: c.title, coverUrl: c.coverUrl, exam: c.programme ? c.programme.shortName ?? c.programme.name : null, subject: c.subject?.name ?? null,
          lessons: c.modules.reduce((n, m) => n + m._count.lessons, 0), selling,
          price: selling === 'paid' ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null,
        };
      }),
      others: others.map(o => ({ slug: o.slug, name: o.name, avatarUrl: o.avatarUrl, courses: o.courses, subjects: o.subjects.slice(0, 2) })),
    };
  }
}
