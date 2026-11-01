import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const PAGE = 50;

/** The admin Users page: everyone, filtered by role, with what matters for each kind of person */
@Injectable()
export class AdminPeopleService {
  constructor(private prisma: PrismaService) {}

  async list(q: { role?: string; search?: string; status?: string; page?: string }) {
    const now = new Date();
    const term = q.search?.trim();
    const where: Prisma.UserProfileWhereInput = {
      ...(q.role && Object.values(UserRole).includes(q.role as UserRole) ? { role: q.role as UserRole } : {}),
      ...(q.status === 'pending' ? { approvalStatus: 'PENDING' } : {}),
      ...(term ? { OR: ['name', 'firstName', 'lastName', 'email', 'phone'].map(f => ({ [f]: { contains: term, mode: 'insensitive' } })) } : {}),
    };
    const page = Math.max(1, Number(q.page) || 1);
    const weekAgo = new Date(+now - 7 * 86_400_000), monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [people, total, byRole, pending, joinedThisMonth, activeWeek, students] = await Promise.all([
      this.prisma.userProfile.findMany({
        where, orderBy: [{ createdAt: 'desc' }], skip: (page - 1) * PAGE, take: PAGE,
        select: {
          id: true, name: true, firstName: true, lastName: true, email: true, role: true, approvalStatus: true, createdAt: true, lastActiveDate: true,
          country: { select: { name: true } },
          purchases: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { package: { select: { name: true } } }, orderBy: { purchasedAt: 'desc' }, take: 2 },
          coursePurchases: { where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { course: { select: { title: true } } }, take: 2 },
          teachingSubjects: { select: { name: true }, take: 3 },
          _count: { select: { platformCourses: true, courseEnrollments: true } },
        },
      }),
      this.prisma.userProfile.count({ where }),
      this.prisma.userProfile.groupBy({ by: ['role'], _count: { _all: true } }),
      this.prisma.userProfile.count({ where: { approvalStatus: 'PENDING' } }),
      this.prisma.userProfile.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.userProfile.count({ where: { role: 'STUDENT', lastActiveDate: { gte: weekAgo } } }),
      this.prisma.userProfile.count({ where: { role: 'STUDENT' } }),
    ]);
    const roleCount = Object.fromEntries(byRole.map(r => [r.role, r._count._all]));
    const rows = people.map(p => {
      const bought = [...p.purchases.map(x => x.package.name), ...p.coursePurchases.map(x => x.course.title)];
      const detail = p.role === 'STUDENT' ? (bought.length ? bought.slice(0, 2).join(', ') : p._count.courseEnrollments ? `${p._count.courseEnrollments} free course${p._count.courseEnrollments === 1 ? '' : 's'}` : 'no courses yet')
        : p.role === 'TEACHER' ? (p._count.platformCourses ? `${p._count.platformCourses} course${p._count.platformCourses === 1 ? '' : 's'}` : p.teachingSubjects.map(s => s.name).join(', ') || 'no courses yet')
        : p.role === 'SUBJECT_REVIEWER' ? p.teachingSubjects.map(s => s.name).join(', ') || 'no subjects yet'
        : p.role === 'COUNTRY_REP' ? p.country?.name ?? 'no country' : '';
      return {
        id: p.id, name: nameOf(p), email: p.email, role: p.role, country: p.country?.name ?? null, detail,
        joinedAt: p.createdAt, lastActive: p.lastActiveDate, approval: p.approvalStatus,
      };
    });
    return {
      rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
      counts: { all: Object.values(roleCount).reduce((a, b) => a + b, 0), ...roleCount, pending },
      stats: { students, activeWeek, joinedThisMonth, teachers: roleCount.TEACHER ?? 0, reviewers: roleCount.SUBJECT_REVIEWER ?? 0, reps: roleCount.COUNTRY_REP ?? 0 },
    };
  }

  async detail(id: string) {
    const now = new Date();
    const p = await this.prisma.userProfile.findUnique({
      where: { id },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, phone: true, role: true, approvalStatus: true, createdAt: true, lastActiveDate: true, avatarUrl: true,
        country: { select: { name: true } }, referredBy: { select: { name: true, firstName: true, lastName: true, email: true } },
        purchases: { select: { id: true, purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, package: { select: { name: true } } }, orderBy: { purchasedAt: 'desc' } },
        coursePurchases: { select: { id: true, purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, course: { select: { title: true } } }, orderBy: { purchasedAt: 'desc' } },
        courseEnrollments: { select: { course: { select: { id: true, title: true, isSoldIndividually: true, priceAmount: true, source: true } } }, take: 20 },
        platformCourses: { select: { id: true, title: true, status: true }, orderBy: { updatedAt: 'desc' }, take: 20 },
        teachingSubjects: { select: { name: true } },
        payoutAccount: { select: { bankName: true, accountNumber: true, isVerified: true } },
        wallet: { select: { balance: true, currency: true } },
        _count: { select: { certificates: true } },
      },
    });
    if (!p) throw new NotFoundException('User not found');
    const paid: Record<string, number> = {};
    for (const x of [...p.purchases, ...p.coursePurchases]) if (x.amountPaid) paid[x.currency ?? 'GHS'] = (paid[x.currency ?? 'GHS'] ?? 0) + x.amountPaid;
    const bought = new Set(p.coursePurchases.map(c => c.course.title));
    return {
      id: p.id, name: nameOf(p), email: p.email, phone: p.phone, role: p.role, approval: p.approvalStatus, avatarUrl: p.avatarUrl,
      country: p.country?.name ?? null, joinedAt: p.createdAt, lastActive: p.lastActiveDate,
      referredBy: p.referredBy ? nameOf(p.referredBy) : null,
      paid: Object.entries(paid).map(([currency, amount]) => ({ currency, amount })),
      certificates: p._count.certificates,
      access: [
        ...p.purchases.map(x => ({ title: x.package.name, kind: 'package', expiresAt: x.expiresAt, active: !x.expiresAt || x.expiresAt > now })),
        ...p.coursePurchases.map(x => ({ title: x.course.title, kind: 'course', expiresAt: x.expiresAt, active: !x.expiresAt || x.expiresAt > now })),
        ...p.courseEnrollments.filter(e => !bought.has(e.course.title) && (e.course.source === 'WORDPRESS' || (e.course.isSoldIndividually && !e.course.priceAmount))).map(e => ({ title: e.course.title, kind: 'free', expiresAt: null, active: true })),
      ],
      payments: [
        ...p.purchases.map(x => ({ id: x.id, title: x.package.name, at: x.purchasedAt, amount: x.amountPaid ?? 0, currency: x.currency ?? 'GHS' })),
        ...p.coursePurchases.map(x => ({ id: x.id, title: x.course.title, at: x.purchasedAt, amount: x.amountPaid, currency: x.currency })),
      ].sort((a, b) => +b.at - +a.at),
      courses: p.platformCourses, subjects: p.teachingSubjects.map(s => s.name),
      payout: p.payoutAccount ? { label: `${p.payoutAccount.bankName} ·· ${p.payoutAccount.accountNumber.replace(/\s+/g, '').slice(-4)}`, verified: p.payoutAccount.isVerified } : null,
      owed: p.wallet && p.role !== 'STUDENT' ? { amount: p.wallet.balance, currency: p.wallet.currency } : null,
    };
  }
}
