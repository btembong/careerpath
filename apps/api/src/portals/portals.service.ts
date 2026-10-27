import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService, wpCourseImageUrl, portalRoleFromWp } from '../wordpress/wordpress.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalStatus, UserRole } from '@cpa/shared';

@Injectable()
export class PortalsService {
  constructor(
    private prisma: PrismaService,
    private wp: WordPressService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  // ── Student portal ───────────────────────────────────────

  /**
   * Return the WordPress course objects the student has active access to.
   * Access is derived from unexpired PackagePurchase rows — never a cached flag.
   */
  async getStudentCourses(studentId: string) {
    const now = new Date();
    const purchases = await this.prisma.packagePurchase.findMany({
      where: {
        studentId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            courseIds: true,
            categoryTags: true,
          },
        },
      },
    });

    // For each package, resolve course IDs to PlatformCourse records
    const packages = await Promise.all(
      purchases.map(async (purchase) => {
        const pkg = purchase.package;
        const courses = pkg.courseIds.length > 0
          ? await this.prisma.platformCourse.findMany({
              where: { id: { in: pkg.courseIds }, status: 'PUBLISHED' },
              select: {
                id: true,
                title: true,
                description: true,
                shortDescription: true,
                coverUrl: true,
                source: true,
                wpCourseId: true,
                wpCourseUrl: true,
                programme: { select: { shortName: true, name: true } },
                subject:   { select: { name: true } },
                level:     { select: { name: true, tier: true } },
                teacher:   { select: { id: true, firstName: true, lastName: true, name: true, avatarUrl: true } },
                _count:    { select: { modules: true } },
              },
            })
          : [];

        // Enrich WP courses with featured images from WordPress
        const enrichedCourses = await Promise.all(
          courses.map(async (course) => {
            if (!course.wpCourseId || course.coverUrl) return course;
            try {
              const wpCourse = await this.wp.getCourseById(course.wpCourseId);
              return { ...course, coverUrl: wpCourseImageUrl(wpCourse) ?? null };
            } catch {
              return course;
            }
          }),
        );

        return {
          id: pkg.id,
          name: pkg.name,
          categoryTags: pkg.categoryTags,
          expiresAt: purchase.expiresAt,
          courses: enrichedCourses,
        };
      }),
    );

    // Also include courses purchased individually
    const now2 = new Date();
    const individualPurchases = await this.prisma.coursePurchase.findMany({
      where: {
        studentId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now2 } }],
      },
      include: {
        course: {
          select: {
            id: true, title: true, description: true, shortDescription: true,
            coverUrl: true, source: true, wpCourseId: true, wpCourseUrl: true,
            programme: { select: { shortName: true, name: true } },
            subject:   { select: { name: true } },
            level:     { select: { name: true, tier: true } },
            teacher:   { select: { id: true, firstName: true, lastName: true, name: true, avatarUrl: true } },
            _count:    { select: { modules: true } },
          },
        },
      },
    });

    const individualCourses = individualPurchases
      .filter(p => p.course.id)
      .map(p => ({ ...p.course }));

    // Include WP courses the student has enrolled in directly (not via package/purchase)
    const alreadyIncludedIds = new Set([
      ...packages.flatMap(p => p.courses.map((c: any) => c.id)),
      ...individualCourses.map(c => c.id),
    ]);

    const wpEnrollments = await this.prisma.courseEnrollment.findMany({
      where: {
        studentId,
        course: { source: 'WORDPRESS' },
        NOT: alreadyIncludedIds.size > 0 ? { courseId: { in: [...alreadyIncludedIds] } } : undefined,
      },
      include: {
        course: {
          select: {
            id: true, title: true, description: true, shortDescription: true,
            coverUrl: true, source: true, wpCourseId: true, wpCourseUrl: true,
            programme: { select: { shortName: true, name: true } },
            subject:   { select: { name: true } },
            level:     { select: { name: true, tier: true } },
            teacher:   { select: { id: true, firstName: true, lastName: true, name: true, avatarUrl: true } },
            _count:    { select: { modules: true } },
          },
        },
      },
    });

    const wpCoursesRaw = wpEnrollments.map(e => e.course);

    // Enrich WP direct-enrollment courses with featured images from WordPress (same as package courses)
    const wpCourses = await Promise.all(
      wpCoursesRaw.map(async (course) => {
        if (!course.wpCourseId || course.coverUrl) return course;
        try {
          const wpCourse = await this.wp.getCourseById(course.wpCourseId);
          return { ...course, coverUrl: wpCourseImageUrl(wpCourse) ?? null };
        } catch {
          return course;
        }
      }),
    );

    return { packages, individualCourses, wpCourses };
  }

  async getStudentCoursePurchases(studentId: string) {
    const purchases = await this.prisma.coursePurchase.findMany({
      where: {
        studentId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        course: {
          select: {
            id: true, title: true, description: true, coverUrl: true,
            priceAmount: true, priceCurrency: true,
            programme: { select: { name: true, shortName: true } },
            subject:   { select: { name: true } },
          },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });
    return purchases;
  }

  async getStudentPurchaseHistory(studentId: string) {
    const [packagePurchases, coursePurchases] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        where: { studentId },
        select: {
          id: true,
          amountPaid: true,
          currency: true,
          purchasedAt: true,
          expiresAt: true,
          package: { select: { id: true, name: true } },
        },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.coursePurchase.findMany({
        where: { studentId },
        select: {
          id: true,
          amountPaid: true,
          currency: true,
          purchasedAt: true,
          expiresAt: true,
          course: { select: { id: true, title: true } },
        },
        orderBy: { purchasedAt: 'desc' },
      }),
    ]);

    const items = [
      ...packagePurchases.map(p => ({
        id: p.id,
        type: 'PACKAGE' as const,
        label: p.package.name,
        amountPaid: p.amountPaid,
        currency: p.currency,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt,
      })),
      ...coursePurchases.map(p => ({
        id: p.id,
        type: 'COURSE' as const,
        label: p.course.title,
        amountPaid: p.amountPaid,
        currency: p.currency,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt,
      })),
    ];

    items.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
    return items;
  }

  // ── Teacher portal ───────────────────────────────────────

  async getTeacherRoster(cohortId: string, teacherId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        students: {
          include: {
            student: { select: { id: true, email: true } },
          },
        },
        liveClasses: {
          orderBy: { scheduledAt: 'asc' },
          take: 5,
        },
        assignments: {
          orderBy: { dueDate: 'asc' },
          take: 5,
        },
      },
    });

    if (!cohort) throw new NotFoundException('Cohort not found');
    if (cohort.teacherId !== teacherId) {
      throw new NotFoundException('Cohort not found');
    }

    return cohort;
  }

  async getTeacherCohorts(teacherId: string) {
    return this.prisma.cohort.findMany({
      where: { teacherId },
      include: {
        _count: { select: { students: true, liveClasses: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ── Student cohorts ──────────────────────────────────────

  async getStudentCohorts(studentId: string) {
    const rosters = await this.prisma.cohortRoster.findMany({
      where: { studentId },
      include: {
        cohort: {
          include: {
            _count: { select: { students: true, liveClasses: true } },
          },
        },
      },
    });
    const cohorts = rosters.map(r => r.cohort);
    const teacherIds = [...new Set(cohorts.map(c => c.teacherId))];
    const teachers = await this.prisma.userProfile.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, email: true, name: true, firstName: true, lastName: true },
    });
    const teacherMap = new Map(teachers.map(t => [t.id, t]));
    return cohorts.map(c => ({ ...c, teacher: teacherMap.get(c.teacherId) ?? null }));
  }

  async getStudentCohortMembers(studentId: string, cohortId: string) {
    // Verify student is in this cohort
    const roster = await this.prisma.cohortRoster.findUnique({
      where: { studentId_cohortId: { studentId, cohortId } },
    });
    if (!roster) return [];
    const members = await this.prisma.cohortRoster.findMany({
      where: { cohortId },
      include: {
        student: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    return members.map(m => m.student);
  }

  // ── Admin cohort management ──────────────────────────────

  async getAllCohorts() {
    const cohorts = await this.prisma.cohort.findMany({
      include: {
        _count: { select: { students: true, liveClasses: true } },
        packages: { select: { id: true, name: true }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });
    const teacherIds = [...new Set(cohorts.map(c => c.teacherId))];
    const teachers = await this.prisma.userProfile.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, email: true, name: true, firstName: true, lastName: true },
    });
    const teacherMap = new Map(teachers.map(t => [t.id, t]));
    return cohorts.map(c => ({
      ...c,
      teacher: teacherMap.get(c.teacherId) ?? null,
      linkedPackage: c.packages[0] ?? null,
    }));
  }

  async createCohortForTeacher(dto: {
    name: string;
    teacherId: string;
    sittingLabel?: string;
    examDate?: string;
    startDate?: string;
  }) {
    const teacher = await this.prisma.userProfile.findFirst({
      where: { id: dto.teacherId, role: UserRole.TEACHER },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return this.prisma.cohort.create({
      data: {
        name: dto.name.trim(),
        teacherId: dto.teacherId,
        sittingLabel: dto.sittingLabel?.trim() || null,
        examDate:  dto.examDate  ? new Date(dto.examDate)  : null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
      },
    });
  }

  async updateCohort(cohortId: string, dto: {
    sittingLabel?: string;
    examDate?: string;
    startDate?: string;
  }) {
    return this.prisma.cohort.update({
      where: { id: cohortId },
      data: {
        ...(dto.sittingLabel !== undefined && { sittingLabel: dto.sittingLabel?.trim() || null }),
        ...(dto.examDate  !== undefined && { examDate:  dto.examDate  ? new Date(dto.examDate)  : null }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
      },
    });
  }

  async addStudentToCohort(cohortId: string, studentEmail: string) {
    const student = await this.prisma.userProfile.findFirst({
      where: { email: { equals: studentEmail, mode: 'insensitive' }, role: UserRole.STUDENT },
    });
    if (!student) throw new NotFoundException('Student not found');
    const existing = await this.prisma.cohortRoster.findUnique({
      where: { studentId_cohortId: { studentId: student.id, cohortId } },
    });
    if (existing) throw new BadRequestException('Student already in cohort');
    await this.prisma.cohortRoster.create({ data: { studentId: student.id, cohortId } });
    return { ok: true };
  }

  async removeStudentFromCohort(cohortId: string, studentId: string) {
    await this.prisma.cohortRoster.deleteMany({ where: { cohortId, studentId } });
    return { ok: true };
  }

  async getCohortRoster(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        students: {
          include: { student: { select: { id: true, email: true, name: true } } },
        },
        liveClasses: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    const teacher = await this.prisma.userProfile.findUnique({
      where: { id: cohort.teacherId },
      select: { id: true, email: true, name: true },
    });
    return { ...cohort, teacher };
  }

  // ── Teacher student progress ─────────────────────────────

  /**
   * Overall progress for a single student across all courses they are enrolled in.
   * Used by the teacher cohort detail page to render per-student progress bars.
   */
  async getStudentProgress(studentId: string, teacherId: string) {
    // Verify this student is in at least one of the teacher's cohorts
    const inCohort = await this.prisma.cohortRoster.findFirst({
      where: {
        studentId,
        cohort: { teacherId },
      },
    });
    if (!inCohort) throw new NotFoundException('Student not found in your cohorts');

    // All lesson completions for this student
    const completions = await this.prisma.lessonProgress.findMany({
      where: { studentId },
      select: { lessonId: true, completed: true },
    });

    // All lessons that exist in courses the student has enrolled in
    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { studentId },
      select: { courseId: true },
    });
    const courseIds = enrollments.map(e => e.courseId);

    const totalLessons = await this.prisma.lesson.count({
      where: { module: { courseId: { in: courseIds } } },
    });

    const completedCount = completions.filter(c => c.completed).length;
    const overallPercent = totalLessons > 0
      ? Math.round((completedCount / totalLessons) * 100)
      : 0;

    return { studentId, overallPercent, completedLessons: completedCount, totalLessons };
  }

  // ── Admin portal ─────────────────────────────────────────

  async getBillingStats() {
    const [totalPurchases, packages, recentPurchases] = await Promise.all([
      this.prisma.packagePurchase.count(),
      this.prisma.package.findMany({
        where: { isPublished: true },
        select: { id: true, name: true, currency: true, priceAmount: true },
      }),
      this.prisma.packagePurchase.findMany({
        take: 10,
        orderBy: { purchasedAt: 'desc' },
        include: {
          student: { select: { email: true } },
          package: { select: { name: true, priceAmount: true, currency: true } },
        },
      }),
    ]);

    // Revenue per package (in native currency — no conversion here)
    const grouped = await this.prisma.packagePurchase.groupBy({
      by: ['packageId'],
      _count: { id: true },
      _sum: { amountPaid: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const names = new Map(
      (await this.prisma.package.findMany({
        where: { id: { in: grouped.map(g => g.packageId) } },
        select: { id: true, name: true, currency: true },
      })).map(p => [p.id, p]),
    );
    const salesPerPackage = grouped.map(g => ({
      packageId: g.packageId,
      packageName: names.get(g.packageId)?.name ?? 'Deleted package',
      currency: names.get(g.packageId)?.currency ?? null,
      count: g._count.id,
      revenue: g._sum.amountPaid ?? 0,
    }));

    return {
      totalPurchases,
      activePackages: packages.length,
      salesPerPackage,
      recentPurchases,
    };
  }

  async getAdminAnalytics() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      totalStudents, totalTeachers, totalCourses, totalEnrollments,
      recentEnrollments, completions, topCourses, teacherRevenue,
      revenueSnapshots,
    ] = await Promise.all([
      this.prisma.userProfile.count({ where: { role: 'STUDENT' } }),
      this.prisma.userProfile.count({ where: { role: 'TEACHER', approvalStatus: 'APPROVED' } }),
      this.prisma.platformCourse.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.courseEnrollment.count(),

      // Enrollments last 30 days
      this.prisma.courseEnrollment.count({
        where: { enrolledAt: { gte: thirtyDaysAgo } },
      }),

      // Total completed enrollments
      this.prisma.courseEnrollment.count({ where: { completedAt: { not: null } } }),

      // Top 10 courses by enrollment
      this.prisma.platformCourse.findMany({
        where: { status: 'PUBLISHED' },
        select: {
          id: true, title: true, coverUrl: true,
          teacher: { select: { name: true, firstName: true, lastName: true } },
          _count: { select: { enrollments: true, certificates: true } },
        },
        orderBy: { enrollments: { _count: 'desc' } },
        take: 10,
      }),

      // Revenue per teacher (from wallet credits)
      this.prisma.wallet.findMany({
        where: { user: { role: 'TEACHER' } },
        select: {
          balance: true, currency: true,
          user: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true } },
        },
        orderBy: { balance: 'desc' },
        take: 10,
      }),

      // Last 14 days revenue snapshots for sparkline
      this.prisma.revenueSnapshot.findMany({
        where: { date: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
        orderBy: { date: 'asc' },
        select: { date: true, totalRevenue: true, newPurchases: true },
      }),
    ]);

    const completionRate = totalEnrollments > 0
      ? Math.round((completions / totalEnrollments) * 100)
      : 0;

    return {
      summary: {
        totalStudents,
        totalTeachers,
        totalCourses,
        totalEnrollments,
        completionRate,
        recentEnrollments30d: recentEnrollments,
      },
      topCourses: topCourses.map(c => ({
        id: c.id,
        title: c.title,
        coverUrl: c.coverUrl,
        teacher: c.teacher.name ?? ([c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') || 'Teacher'),
        enrollments: c._count.enrollments,
        certificates: c._count.certificates,
        completionRate: c._count.enrollments > 0
          ? Math.round((c._count.certificates / c._count.enrollments) * 100)
          : 0,
      })),
      teacherRevenue: teacherRevenue.map(w => ({
        id: w.user.id,
        name: w.user.name ?? ([w.user.firstName, w.user.lastName].filter(Boolean).join(' ') || 'Teacher'),
        avatarUrl: (w.user as any).avatarUrl ?? null,
        balance: w.balance,
        currency: w.currency,
      })),
      revenueSparkline: revenueSnapshots.map(s => ({
        date: s.date.toISOString().split('T')[0],
        revenue: s.totalRevenue,
        purchases: s.newPurchases,
      })),
    };
  }

  async getTeachersByStatus(status?: ApprovalStatus) {
    return this.prisma.userProfile.findMany({
      where: {
        role: UserRole.TEACHER,
        ...(status ? { approvalStatus: status } : {}),
      },
      include: { teacherApplication: true },
      orderBy: { id: 'asc' },
    });
  }

  // ── Admin user management ─────────────────────────────────

  async searchUsers(email: string) {
    return this.prisma.userProfile.findMany({
      where: { email: { contains: email, mode: 'insensitive' } },
      select: { id: true, email: true, role: true, approvalStatus: true, countryId: true },
      take: 15,
      orderBy: { email: 'asc' },
    });
  }

  async listUsers(role?: UserRole) {
    return this.prisma.userProfile.findMany({
      where: role ? { role } : undefined,
      select: { id: true, email: true, role: true, approvalStatus: true, countryId: true },
      orderBy: { email: 'asc' },
      take: 100,
    });
  }

  async setUserRole(targetId: string, role: UserRole, payoutCurrency?: string) {
    const user = await this.prisma.userProfile.findUnique({ where: { id: targetId } });
    if (!user) throw new NotFoundException('User not found');

    if (role === UserRole.SUBJECT_REVIEWER && !payoutCurrency) {
      throw new BadRequestException('payoutCurrency is required when promoting to SUBJECT_REVIEWER');
    }

    const updated = await this.prisma.userProfile.update({
      where: { id: targetId },
      data: { role, approvalStatus: ApprovalStatus.APPROVED },
      select: { id: true, email: true, role: true },
    });

    // Create or update wallet with the correct currency for earning roles
    if (role === UserRole.SUBJECT_REVIEWER && payoutCurrency) {
      const existing = await this.prisma.wallet.findUnique({ where: { userId: targetId } });
      if (!existing) {
        await this.prisma.wallet.create({
          data: { userId: targetId, currency: payoutCurrency.toUpperCase(), balance: 0 },
        });
      } else if (existing.currency !== payoutCurrency.toUpperCase()) {
        await this.prisma.wallet.update({
          where: { userId: targetId },
          data: { currency: payoutCurrency.toUpperCase() },
        });
      }
    }

    return updated;
  }

  /**
   * Bulk-import WordPress users into our DB.
   * - Skips users already in the DB (matched by wpUserId or email).
   * - Maps WP roles via portalRoleFromWp (administrator → ADMIN, author/tutor_instructor → TEACHER).
   * - Everyone is APPROVED; teachers complete their profile at /teacher/onboarding on first login.
   * Returns counts: created, skipped.
   */
  async syncWpUsers(): Promise<{ created: number; skipped: number }> {
    const wpUsers = await this.wp.listAllUsers();
    let created = 0;
    let skipped = 0;

    for (const wu of wpUsers) {
      // Skip if already in DB by wpUserId or email
      const existing = await this.prisma.userProfile.findFirst({
        where: { OR: [{ wpUserId: wu.id }, { email: wu.email }] },
      });
      if (existing) { skipped++; continue; }

      // WP tutors are approved; they complete their teacher profile at first login
      await this.prisma.userProfile.create({
        data: {
          wpUserId: wu.id,
          email: wu.email,
          name: wu.name || null,
          firstName: wu.first_name || null,
          lastName: wu.last_name || null,
          role: portalRoleFromWp(wu.roles) as UserRole,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      });
      created++;
    }

    return { created, skipped };
  }

  async approveOrRejectTeacher(
    targetId: string,
    decision: 'approve' | 'reject',
    rejectionReason?: string,
  ) {
    const teacher = await this.prisma.userProfile.findUnique({
      where: { id: targetId },
    });

    if (!teacher || teacher.role !== UserRole.TEACHER) {
      throw new NotFoundException('Teacher not found');
    }

    if (teacher.approvalStatus !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Teacher application is not in PENDING status');
    }

    const newStatus =
      decision === 'approve' ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED;

    // Store rejection reason in the application record if rejecting
    if (decision === 'reject' && rejectionReason) {
      await this.prisma.teacherApplication.updateMany({
        where: { userId: targetId },
        data: { rejectionReason },
      });
    }

    const result = await this.prisma.userProfile.update({
      where: { id: targetId },
      data: { approvalStatus: newStatus },
      select: { id: true, email: true, approvalStatus: true },
    });

    // Non-critical — send email but don't block the response
    const teacherNo = decision === 'approve'
      ? `TCH-${result.id.replace(/-/g, '').slice(-8).toUpperCase()}`
      : undefined;
    this.mail.sendTeacherApproved(result.email, decision, rejectionReason, teacherNo).catch(() => {});

    this.audit.log(
      null,
      decision === 'approve' ? 'teacher.approved' : 'teacher.rejected',
      'UserProfile',
      targetId,
      { approvalStatus: teacher.approvalStatus },
      { approvalStatus: newStatus },
      rejectionReason ? { rejectionReason } : undefined,
    );

    return result;
  }
}
