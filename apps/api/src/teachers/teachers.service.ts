import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseVideoUrl } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService, wpCourseImageUrl } from '../wordpress/wordpress.service';

@Injectable()
export class TeachersService {
  constructor(
    private prisma: PrismaService,
    private wp: WordPressService,
    private config: ConfigService,
  ) {}

  // ── Public directory ────────────────────────────────────

  async listTeachers(page = 1, limit = 12) {
    const skip = (page - 1) * limit;

    const [teachers, total] = await Promise.all([
      this.prisma.userProfile.findMany({
        where: { role: 'TEACHER', approvalStatus: 'APPROVED' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          avatarUrl: true,
          videoIntroUrl: true,
          bio: true,
          teacherApplication: {
            select: {
              yearsExperience: true,
              qualification: true,
              subjectAreas: true,
              linkedinUrl: true,
            },
          },
          teacherReviews: { select: { rating: true } },
          teacherCohorts: { select: { id: true } },
          platformCourses: {
            where: { status: 'PUBLISHED' },
            select: { id: true, title: true, coverUrl: true, wpCourseId: true },
          },
          country: { select: { name: true, code: true } },
        },
        skip,
        take: limit,
        orderBy: { teacherApplication: { submittedAt: 'asc' } },
      }),
      this.prisma.userProfile.count({
        where: { role: 'TEACHER', approvalStatus: 'APPROVED' },
      }),
    ]);

    return {
      data: teachers.map(this.formatTeacher),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // ── Single teacher ──────────────────────────────────────

  async getTeacher(teacherId: string) {
    const teacher = await this.prisma.userProfile.findFirst({
      where: { id: teacherId, role: 'TEACHER', approvalStatus: 'APPROVED' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        name: true,
        avatarUrl: true,
        videoIntroUrl: true,
        timezone: true,
        bio: true,
        linkedinUrl: true,
        websiteUrl: true,
        teacherApplication: {
          select: {
            yearsExperience: true,
            qualification: true,
            subjectAreas: true,
            teachingModality: true,
            linkedinUrl: true,
            websiteUrl: true,
          },
        },
        teacherReviews: {
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
            student: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        teacherCohorts: { select: { id: true, name: true } },
        platformCourses: {
          where: { status: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            description: true,
            coverUrl: true,
            wpCourseId: true,
            wpCourseUrl: true,
            programme: { select: { name: true } },
            subject: { select: { name: true } },
          },
        },
        mentorSlots: {
          where: { isBooked: false, startsAt: { gt: new Date() } },
          select: { id: true, startsAt: true, endsAt: true, durationMins: true },
          orderBy: { startsAt: 'asc' },
          take: 10,
        },
        country: { select: { name: true, code: true } },
      },
    });

    if (!teacher) throw new NotFoundException('Teacher not found');

    // Enrich WP courses with featured images
    const coursesWithImages = await Promise.all(
      teacher.platformCourses.map(async (course) => {
        if (!course.wpCourseId) return { ...course, imageUrl: course.coverUrl ?? null };
        try {
          const wpCourse = await this.wp.getCourseById(course.wpCourseId);
          return { ...course, imageUrl: wpCourseImageUrl(wpCourse) ?? course.coverUrl ?? null };
        } catch {
          return { ...course, imageUrl: course.coverUrl ?? null };
        }
      }),
    );

    return {
      ...this.formatTeacher({ ...teacher, platformCourses: teacher.platformCourses }),
      courses: coursesWithImages,
      reviews: teacher.teacherReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        student: {
          name: [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || 'Anonymous',
          avatarUrl: r.student.avatarUrl,
        },
      })),
      availableSlots: teacher.mentorSlots,
    };
  }

  // ── Submit review ───────────────────────────────────────

  async submitReview(teacherId: string, studentId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) throw new BadRequestException('Rating must be between 1 and 5');

    const teacher = await this.prisma.userProfile.findFirst({
      where: { id: teacherId, role: 'TEACHER' },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    return this.prisma.teacherReview.upsert({
      where: { teacherId_studentId: { teacherId, studentId } },
      create: { teacherId, studentId, rating, comment },
      update: { rating, comment },
    });
  }

  // ── Teacher: get own full profile ───────────────────────

  async getOwnProfile(teacherId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: teacherId },
      include: {
        teacherApplication: true,
        country: { select: { name: true, code: true } },
        platformCourses: {
          where: { status: { not: 'ARCHIVED' } },
          select: {
            id: true, title: true, status: true, coverUrl: true,
            wpCourseId: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        teacherReviews: { select: { rating: true } },
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const ratings = profile.teacherReviews.map((r) => r.rating);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

    return {
      ...profile,
      avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      reviewCount: ratings.length,
    };
  }

  // ── Teacher: update own profile ─────────────────────────

  async updateOwnProfile(teacherId: string, dto: {
    bio?: string;
    avatarUrl?: string;
    videoIntroUrl?: string | null;
    linkedinUrl?: string;
    websiteUrl?: string;
    firstName?: string;
    lastName?: string;
    timezone?: string;
  }) {
    const videoIntroUrl = dto.videoIntroUrl !== undefined ? this.normaliseVideoUrl(dto.videoIntroUrl) : undefined;
    return this.prisma.userProfile.update({
      where: { id: teacherId },
      data: {
        ...(dto.bio            !== undefined && { bio: dto.bio }),
        ...(dto.avatarUrl      !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(videoIntroUrl      !== undefined && { videoIntroUrl }),
        ...(dto.linkedinUrl    !== undefined && { linkedinUrl: dto.linkedinUrl }),
        ...(dto.websiteUrl     !== undefined && { websiteUrl: dto.websiteUrl }),
        ...(dto.firstName      !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName       !== undefined && { lastName: dto.lastName }),
        ...(dto.timezone       !== undefined && { timezone: dto.timezone }),
      },
      select: { id: true, bio: true, avatarUrl: true, videoIntroUrl: true, linkedinUrl: true, websiteUrl: true, firstName: true, lastName: true, timezone: true },
    });
  }

  async adminSetIntroVideo(teacherId: string, videoIntroUrl: string | null) {
    const teacher = await this.prisma.userProfile.findFirst({ where: { id: teacherId, role: 'TEACHER' }, select: { id: true } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return this.prisma.userProfile.update({
      where: { id: teacherId },
      data: { videoIntroUrl: this.normaliseVideoUrl(videoIntroUrl) },
      select: { id: true, videoIntroUrl: true },
    });
  }

  // ── Helpers ─────────────────────────────────────────────

  /** Empty clears the video; otherwise it must be YouTube/Vimeo or a file in our own R2 bucket. */
  normaliseVideoUrl(raw: string | null): string | null {
    if (!raw || !raw.trim()) return null;
    const parsed = parseVideoUrl(raw);
    const r2Base = this.config.get<string>('R2_PUBLIC_URL', '');
    if (!parsed || (parsed.kind === 'file' && !(r2Base && parsed.src.startsWith(r2Base)))) {
      throw new BadRequestException('Use a YouTube or Vimeo link, or upload the video file directly.');
    }
    return raw.trim();
  }

  private formatTeacher(t: any) {
    const ratings: number[] = t.teacherReviews?.map((r: any) => r.rating) ?? [];
    const avgRating = ratings.length ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : null;
    const rounded = avgRating ? Math.round(avgRating * 10) / 10 : null;

    // Reputation badges (Preply-style)
    const badge = this.computeBadge(rounded, ratings.length);

    return {
      id: t.id,
      name: t.name ?? ([t.firstName, t.lastName].filter(Boolean).join(' ') || 'Teacher'),
      firstName: t.firstName,
      lastName: t.lastName,
      avatarUrl: t.avatarUrl,
      videoIntroUrl: t.videoIntroUrl ?? null,
      bio: t.bio ?? t.teacherApplication?.bio ?? null,
      country: t.country,
      yearsExperience: t.teacherApplication?.yearsExperience ?? null,
      qualification: t.teacherApplication?.qualification ?? null,
      subjectAreas: t.teacherApplication?.subjectAreas ?? [],
      teachingModality: t.teacherApplication?.teachingModality ?? null,
      linkedinUrl: t.linkedinUrl ?? t.teacherApplication?.linkedinUrl ?? null,
      websiteUrl: t.websiteUrl ?? t.teacherApplication?.websiteUrl ?? null,
      avgRating: rounded,
      reviewCount: ratings.length,
      cohortCount: t.teacherCohorts?.length ?? 0,
      courseCount: t.platformCourses?.length ?? 0,
      badge,
    };
  }

  /** Compute a reputation badge based on avg rating and review volume. */
  private computeBadge(avg: number | null, reviewCount: number): 'top_rated' | 'rising_star' | 'new' | null {
    if (!avg) return reviewCount === 0 ? 'new' : null;
    if (avg >= 4.8 && reviewCount >= 10) return 'top_rated';
    if (avg >= 4.5 && reviewCount >= 3) return 'rising_star';
    if (reviewCount === 0) return 'new';
    return null;
  }
}
