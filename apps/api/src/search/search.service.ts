import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, type: 'courses' | 'teachers' | 'all' = 'all') {
    const term = q.trim();
    if (!term) return { courses: [], teachers: [] };

    const [courses, teachers] = await Promise.all([
      type !== 'teachers' ? this.searchCourses(term) : [],
      type !== 'courses' ? this.searchTeachers(term) : [],
    ]);

    return { courses, teachers };
  }

  private async searchCourses(term: string) {
    const rows = await this.prisma.platformCourse.findMany({
      where: {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { shortDescription: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { subject: { name: { contains: term, mode: 'insensitive' } } },
          { programme: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true, title: true, shortDescription: true, coverUrl: true,
        source: true, wpCourseUrl: true,
        teacher: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true } },
        subject: { select: { name: true } },
        programme: { select: { name: true, shortName: true } },
        _count: { select: { enrollments: true } },
      },
      take: 20,
    });

    return rows.map(c => ({
      id: c.id,
      title: c.title,
      shortDescription: c.shortDescription,
      coverUrl: c.coverUrl,
      source: c.source,
      wpCourseUrl: c.wpCourseUrl,
      teacherName: c.teacher.name ?? ([c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') || 'CPA Teacher'),
      teacherAvatar: c.teacher.avatarUrl,
      subject: c.subject?.name ?? null,
      programme: c.programme?.shortName ?? c.programme?.name ?? null,
      enrollmentCount: c._count.enrollments,
    }));
  }

  private async searchTeachers(term: string) {
    const rows = await this.prisma.userProfile.findMany({
      where: {
        role: 'TEACHER',
        approvalStatus: 'APPROVED',
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { bio: { contains: term, mode: 'insensitive' } },
          { teachingSubjects: { some: { name: { contains: term, mode: 'insensitive' } } } },
          { teachingProgrammes: { some: { name: { contains: term, mode: 'insensitive' } } } },
        ],
      },
      select: {
        id: true, name: true, firstName: true, lastName: true,
        avatarUrl: true, videoIntroUrl: true, bio: true,
        country: { select: { name: true, code: true } },
        teachingSubjects: { select: { name: true } },
        teacherReviews: { select: { rating: true } },
        _count: { select: { platformCourses: true, mentorSlots: true } },
      },
      take: 20,
    });

    return rows.map(t => {
      const ratings = t.teacherReviews.map(r => r.rating);
      const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
      return {
        id: t.id,
        name: t.name ?? ([t.firstName, t.lastName].filter(Boolean).join(' ') || 'Teacher'),
        avatarUrl: t.avatarUrl,
        videoIntroUrl: t.videoIntroUrl,
        bio: t.bio,
        country: t.country?.name ?? null,
        subjects: t.teachingSubjects.map(s => s.name),
        avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
        reviewCount: ratings.length,
        courseCount: t._count.platformCourses,
      };
    });
  }
}
