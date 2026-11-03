import { Injectable, NotFoundException } from '@nestjs/common';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedBrandFonts } from './pdf-fonts';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const GATEWAY: Record<string, string> = { paystack: 'Card or mobile money (Paystack)', tranzak: 'Mobile money (Tranzak)', stripe: 'Card (Stripe)', manual: 'Recorded by CareerPath' };
const money = (amount: number, currency: string) => `${currency} ${minorToMajor(amount, currency).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;

/** A student's access, payments and receipts */
@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async billing(studentId: string) {
    const now = new Date();
    const [packages, courses, enrollments] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { studentId }, include: { package: { select: { id: true, name: true, courseIds: true, validityDays: true, cohort: { select: { name: true, examDate: true } }, mentorship: true } } }, orderBy: { purchasedAt: 'desc' } }),
      this.prisma.coursePurchase.findMany({ where: { studentId }, include: { course: { select: { id: true, title: true } } }, orderBy: { purchasedAt: 'desc' } }),
      this.prisma.courseEnrollment.findMany({ where: { studentId, course: { OR: [{ priceAmount: null }, { priceAmount: 0 }], status: 'PUBLISHED' } }, include: { course: { select: { id: true, title: true, source: true } } } }),
    ]);

    const span = (from: Date, to: Date | null) => {
      if (!to) return { pctUsed: 0, daysLeft: null as number | null, ended: false };
      const total = Math.max(1, +to - +from), used = Math.min(total, Math.max(0, +now - +from));
      return { pctUsed: Math.round((used / total) * 100), daysLeft: Math.ceil((+to - +now) / DAY), ended: to < now };
    };
    const access = [
      ...packages.map(p => ({
        kind: 'package' as const, id: p.package.id, title: p.package.name,
        detail: [`Package · ${p.package.courseIds.length} course${p.package.courseIds.length === 1 ? '' : 's'}`, p.package.cohort ? 'live classes' : null, p.package.mentorship ? 'mentorship' : null].filter(Boolean).join(', '),
        examDate: p.package.cohort?.examDate ?? null, expiresAt: p.expiresAt, ...span(p.purchasedAt, p.expiresAt),
        href: `/packages/${p.package.id}`,
      })),
      ...courses.map(c => ({ kind: 'course' as const, id: c.course.id, title: c.course.title, detail: 'Single course', examDate: null, expiresAt: c.expiresAt, ...span(c.purchasedAt, c.expiresAt), href: `/student/courses/${c.course.id}` })),
      ...enrollments.filter(e => !courses.some(c => c.courseId === e.courseId)).map(e => ({ kind: 'free' as const, id: e.course.id, title: e.course.title, detail: 'Free course', examDate: null, expiresAt: null, pctUsed: 0, daysLeft: null, ended: false, href: `/student/courses/${e.course.id}` })),
    ]
      // Keep one row per thing (a renewed package appears once, with its latest access)
      .filter((a, i, all) => all.findIndex(b => b.kind === a.kind && b.id === a.id) === i)
      .sort((a, b) => Number(a.ended) - Number(b.ended) || (a.daysLeft ?? 99_999) - (b.daysLeft ?? 99_999));

    const payments = [
      ...packages.map(p => ({ id: p.id, kind: 'package' as const, title: p.package.name, at: p.purchasedAt, amount: p.amountPaid ?? 0, currency: p.currency ?? 'GHS', gateway: p.gateway, invoiceNo: p.invoiceNo })),
      ...courses.map(c => ({ id: c.id, kind: 'course' as const, title: c.course.title, at: c.purchasedAt, amount: c.amountPaid, currency: c.currency, gateway: c.gateway, invoiceNo: c.invoiceNo })),
    ].sort((a, b) => +b.at - +a.at).map(p => ({ ...p, method: p.gateway ? GATEWAY[p.gateway] ?? p.gateway : p.amount ? 'Recorded by CareerPath' : 'Free' }));

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const thisYear = payments.filter(p => p.at >= yearStart && p.amount > 0);
    const totals = Object.entries(thisYear.reduce((m, p) => ({ ...m, [p.currency]: (m[p.currency] ?? 0) + p.amount }), {} as Record<string, number>)).map(([currency, amount]) => ({ currency, amount }));
    return { access, payments, paidThisYear: totals };
  }

  /** A one-page PDF receipt for one of the student's own purchases */
  async receipt(studentId: string, kind: string, id: string): Promise<{ filename: string; pdf: Uint8Array }> {
    const student = await this.prisma.userProfile.findUnique({ where: { id: studentId }, select: { name: true, firstName: true, lastName: true, email: true, phone: true } });
    let p: { title: string; at: Date; amount: number; currency: string; gateway: string | null; gatewayRef: string | null; invoiceNo: string | null; expiresAt: Date | null } | null = null;
    if (kind === 'package') {
      const x = await this.prisma.packagePurchase.findFirst({ where: { id, studentId }, include: { package: { select: { name: true } } } });
      if (x) p = { title: x.package.name, at: x.purchasedAt, amount: x.amountPaid ?? 0, currency: x.currency ?? 'GHS', gateway: x.gateway, gatewayRef: x.gatewayRef, invoiceNo: x.invoiceNo, expiresAt: x.expiresAt };
    } else if (kind === 'course') {
      const x = await this.prisma.coursePurchase.findFirst({ where: { id, studentId }, include: { course: { select: { title: true } } } });
      if (x) p = { title: x.course.title, at: x.purchasedAt, amount: x.amountPaid, currency: x.currency, gateway: x.gateway, gatewayRef: x.gatewayRef, invoiceNo: x.invoiceNo, expiresAt: x.expiresAt };
    }
    if (!p || !student) throw new NotFoundException('Receipt not found');

    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const { regular: font, bold } = await embedBrandFonts(doc);
    const navy = rgb(7 / 255, 32 / 255, 97 / 255), blue = rgb(63 / 255, 111 / 255, 232 / 255), grey = rgb(99 / 255, 112 / 255, 144 / 255);
    const text = (t: string, x: number, y: number, size = 11, f = font, color = navy) => page.drawText(t, { x, y, size, font: f, color });

    page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: blue });
    page.drawRectangle({ x: 48, y: 793, width: 28, height: 28, color: rgb(1, 1, 1) });
    text('C', 62 - bold.widthOfTextAtSize('C', 16) / 2, 801, 16, bold, blue);
    text('careerpath', 86, 800, 20, bold, navy);
    text('.', 86 + bold.widthOfTextAtSize('careerpath', 20), 800, 20, bold, rgb(1, 1, 1));
    text('Receipt', 470, 800, 16, bold, rgb(1, 1, 1));
    const name = student.name || [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
    let y = 730;
    const row = (label: string, value: string) => { text(label, 48, y, 10, font, grey); text(value, 200, y, 11); y -= 24; };
    row('Receipt number', p.invoiceNo ?? `CPA-${id.slice(0, 8).toUpperCase()}`);
    row('Date paid', p.at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }));
    row('Billed to', name);
    row('Email', student.email);
    if (student.phone) row('Phone', student.phone);
    y -= 12;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.89, 0.91, 0.95) });
    y -= 28;
    text(kind === 'package' ? 'Package' : 'Course', 48, y, 10, font, grey); text('Amount', 470, y, 10, font, grey); y -= 22;
    text(p.title.length > 60 ? p.title.slice(0, 58) + '…' : p.title, 48, y, 12, bold); text(money(p.amount, p.currency), 470, y, 12, bold); y -= 18;
    if (p.expiresAt) { text(`Access until ${p.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 48, y, 10, font, grey); y -= 18; }
    y -= 16;
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 1, color: rgb(0.89, 0.91, 0.95) });
    y -= 26;
    text('Total paid', 330, y, 12, bold); text(money(p.amount, p.currency), 470, y, 12, bold, blue); y -= 30;
    row('Paid with', p.gateway ? GATEWAY[p.gateway] ?? p.gateway : p.amount ? 'Recorded by CareerPath' : 'Free');
    if (p.gatewayRef) row('Payment reference', p.gatewayRef);
    text('Thank you for learning with CareerPath Africa.', 48, 90, 10, font, grey);
    text('Questions about this payment: billing@careerpathafrica.com', 48, 74, 10, font, grey);

    const pdf = await doc.save();
    return { filename: `receipt-${(p.invoiceNo ?? id.slice(0, 8)).replace(/[^\w-]/g, '')}.pdf`, pdf };
  }
}
