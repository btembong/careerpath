import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomBytes } from 'crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedBrandFonts } from '../payments/pdf-fonts';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CertificatesService {
  private readonly portalUrl: string;

  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
    private mail: MailService,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {
    this.portalUrl = this.config.get<string>('PORTAL_URL', 'https://portal.careerpathafrica.com');
  }

  // ── Student: their own certificates ─────────────────────

  async getMyCertificates(studentId: string) {
    const certs = await this.prisma.certificate.findMany({
      where: { studentId },
      orderBy: { issuedAt: 'desc' },
      include: {
        course: { select: { title: true } },
      },
    });
    return certs.map(c => ({
      id: c.id,
      courseId: c.courseId,
      courseName: c.course?.title ?? 'Course Completion',
      issuedAt: c.issuedAt,
      verifyCode: c.verifyCode,
      // Always the on-demand PDF, so certificates issued before storage was configured still download
      pdfUrl: `/api/certificates/${c.verifyCode}/pdf`,
    }));
  }

  // ── Public: verify a certificate ─────────────────────────

  /**
   * Public check that a certificate is genuine. Shows the first name and initials only (never the
   * email): enough for an employer to match it to the person in front of them.
   */
  async verifyCertificate(verifyCode: string) {
    const code = String(verifyCode ?? '').trim().toUpperCase();
    const cert = /^[A-Z0-9-]{4,40}$/.test(code) ? await this.prisma.certificate.findUnique({
      where: { verifyCode: code },
      include: {
        student: { select: { email: true, name: true, firstName: true, lastName: true } },
        course: { select: { title: true, teacherPending: true, teacher: { select: { name: true, firstName: true, lastName: true } } } },
      },
    }) : null;
    if (!cert) return { valid: false as const, verifyCode: code };

    const s = cert.student;
    const full = (s.name || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email.split('@')[0]).trim();
    const [first, ...rest] = full.split(/\s+/);
    const shortName = [first, rest.map(w => w.split('-').map(p => `${p[0]?.toUpperCase() ?? ''}.`).join('-')).join(' ')].filter(Boolean).join(' ');
    const t = cert.course?.teacher;
    return {
      valid: true as const,
      verifyCode: cert.verifyCode,
      studentName: shortName,
      courseName: cert.course?.title ?? 'Course',
      teacher: cert.course && !cert.course.teacherPending && t ? (t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || null) : null,
      issuedAt: cert.issuedAt,
    };
  }


  // ── Admin: manually issue or revoke ──────────────────────

  async adminIssueCertificate(studentId: string, courseId: string): Promise<void> {
    await this.issueCertificate(studentId, courseId);
  }

  async adminRevokeCertificate(certId: string): Promise<void> {
    const cert = await this.prisma.certificate.findUnique({ where: { id: certId } });
    if (!cert) throw new NotFoundException('Certificate not found');
    await this.prisma.certificate.delete({ where: { id: certId } });
  }

  // ── Auto-issue when course is completed ──────────────────

  /**
   * Idempotent: re-calling for the same student+course is a no-op.
   * Called from:
   *   - education.service (quiz pass ≥ 70% on MCQ-only courses)
   *   - platform-courses.service (100% lesson completion)
   */
  async issueCertificate(studentId: string, courseId: string): Promise<void> {
    const existing = await this.prisma.certificate.findFirst({
      where: { studentId, courseId },
    });
    if (existing) return; // already issued

    const [student, course] = await Promise.all([
      this.prisma.userProfile.findUnique({
        where: { id: studentId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.prisma.platformCourse.findUnique({
        where: { id: courseId },
        select: { title: true },
      }),
    ]);

    if (!student) throw new NotFoundException('Student not found');

    const studentName =
      student.firstName || student.lastName
        ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
        : student.email;

    const courseTitle = course?.title ?? courseId;
    const verifyCode = randomBytes(8).toString('hex').toUpperCase();

    // The PDF is generated on download (getPdf) rather than pre-uploaded to storage, so issuing a
    // certificate can never fail because R2 is down or unconfigured. Served via the portal's /api proxy.
    const pdfUrl = `/api/certificates/${verifyCode}/pdf`;

    await this.prisma.certificate.create({
      data: { studentId, courseId, verifyCode, pdfUrl },
    });
    await this.gamification.awardOnce(studentId, 'CERTIFICATE_EARNED', courseId);

    // Send certificate earned email — non-critical
    const verifyUrl = `${this.portalUrl}/verify/${verifyCode}`;
    this.mail.sendCertificateEarned(student.email, studentName, courseTitle, verifyUrl).catch(() => {});
    this.notifications.notify(studentId, {
      type: 'certificate',
      title: 'Certificate issued',
      body: `Congratulations! Your certificate for "${courseTitle}" is ready.`,
      href: '/student/certificates',
    });
  }

  /** Public by verify code — the same code already makes the certificate publicly verifiable. */
  async getPdf(verifyCode: string): Promise<{ buffer: Buffer; filename: string }> {
    const cert = await this.prisma.certificate.findUnique({
      where: { verifyCode },
      include: {
        student: { select: { email: true, firstName: true, lastName: true } },
        course: { select: { title: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    const s = cert.student;
    const studentName = s.firstName || s.lastName ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : s.email;
    const buffer = await this.generateCertificatePdf({
      studentName,
      courseTitle: cert.course?.title ?? cert.courseId,
      verifyCode: cert.verifyCode,
      issuedAt: cert.issuedAt,
    });
    return { buffer, filename: `CareerPath-Africa-certificate-${cert.verifyCode}.pdf` };
  }

  // ── PDF generation ────────────────────────────────────────

  private async generateCertificatePdf(data: {
    studentName: string;
    courseTitle: string;
    verifyCode: string;
    issuedAt: Date;
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([842, 595]); // A4 landscape
    const { width, height } = page.getSize();

    // Bricolage Grotesque, so names with accents and other letters print exactly as typed
    const { regular: regularFont, bold: boldFont } = await embedBrandFonts(doc);
    const italicFont = regularFont;
    const centred = (t: string, size: number, font = regularFont) => font.widthOfTextAtSize(t, size) / 2;

    // Brand colours
    const navy  = rgb(0.027, 0.125, 0.380); // #072061
    const azure = rgb(0.345, 0.537, 0.980); // #5889FA
    const gold  = rgb(0.82, 0.67, 0.20);
    const light = rgb(0.95, 0.96, 0.99);
    const grey  = rgb(0.45, 0.45, 0.45);
    const white = rgb(1, 1, 1);

    // ── Background ──────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width, height, color: white });

    // Left navy stripe
    page.drawRectangle({ x: 0, y: 0, width: 28, height, color: navy });

    // Top blue band
    const blue = rgb(63 / 255, 111 / 255, 232 / 255); // #3F6FE8
    page.drawRectangle({ x: 28, y: height - 90, width: width - 28, height: 90, color: blue });

    // Light inner content area
    page.drawRectangle({ x: 48, y: 50, width: width - 76, height: height - 160, color: light });

    // ── Gold accent lines ───────────────────────────────────
    page.drawRectangle({ x: 28, y: height - 93, width: width - 28, height: 3, color: gold });
    page.drawRectangle({ x: 48, y: 47,           width: width - 76, height: 3, color: gold });

    // ── Header — logo mark + title ──────────────────────────
    // "careerpath." logo: white C tile, navy word, white dot
    // Rounded C tile, like the logo on the site (SVG paths run downwards from the top-left corner)
    page.drawSvgPath('M7,0 H27 A7,7 0 0 1 34,7 V27 A7,7 0 0 1 27,34 H7 A7,7 0 0 1 0,27 V7 A7,7 0 0 1 7,0 Z', { x: 66, y: height - 28, color: white });
    page.drawText('C', {
      x: 83 - boldFont.widthOfTextAtSize('C', 20) / 2, y: height - 52,
      size: 20, font: boldFont, color: blue,
    });
    page.drawText('careerpath', { x: 110, y: height - 52, size: 20, font: boldFont, color: navy });
    page.drawText('.', { x: 110 + boldFont.widthOfTextAtSize('careerpath', 20), y: height - 52, size: 20, font: boldFont, color: white });

    page.drawText('CERTIFICATE OF COMPLETION', {
      x: width - 48 - boldFont.widthOfTextAtSize('CERTIFICATE OF COMPLETION', 13), y: height - 55,
      size: 13, font: boldFont, color: white,
    });

    // ── Body ────────────────────────────────────────────────
    const centerX = (width + 28) / 2; // center of the right panel

    page.drawText('This is to certify that', {
      x: centerX - centred('This is to certify that', 11), y: height - 135,
      size: 11, font: italicFont, color: grey,
    });

    // Student name — large, navy
    const nameSize = data.studentName.length > 30 ? 26 : 30;
    const nameWidth = boldFont.widthOfTextAtSize(data.studentName, nameSize);
    page.drawText(data.studentName, {
      x: centerX - nameWidth / 2, y: height - 175,
      size: nameSize, font: boldFont, color: navy,
    });

    // Underline beneath name
    page.drawLine({
      start: { x: centerX - nameWidth / 2, y: height - 182 },
      end:   { x: centerX + nameWidth / 2, y: height - 182 },
      thickness: 1.5,
      color: azure,
    });

    page.drawText('has successfully completed', {
      x: centerX - centred('has successfully completed', 11), y: height - 215,
      size: 11, font: italicFont, color: grey,
    });

    // Course title
    const titleSize = data.courseTitle.length > 45 ? 16 : 20;
    const titleWidth = boldFont.widthOfTextAtSize(data.courseTitle, titleSize);
    page.drawText(data.courseTitle, {
      x: centerX - titleWidth / 2, y: height - 255,
      size: titleSize, font: boldFont, color: navy,
    });

    // ── Issued date ─────────────────────────────────────────
    const issuedStr = data.issuedAt.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    page.drawText(`Issued: ${issuedStr}`, {
      x: centerX - centred(`Issued: ${issuedStr}`, 10), y: height - 310,
      size: 10, font: regularFont, color: grey,
    });

    // ── Signature area ──────────────────────────────────────
    const sigX = 120;
    page.drawLine({
      start: { x: sigX,       y: height - 360 },
      end:   { x: sigX + 140, y: height - 360 },
      thickness: 1, color: navy,
    });
    page.drawText('Authorised Signatory', {
      x: sigX + 70 - centred('Authorised Signatory', 9), y: height - 375,
      size: 9, font: regularFont, color: grey,
    });
    page.drawText('CareerPath Africa', {
      x: sigX + 70 - centred('CareerPath Africa', 9, boldFont), y: height - 388,
      size: 9, font: boldFont, color: navy,
    });

    // ── Verification footer ─────────────────────────────────
    const footerY = 58;
    page.drawText(`Verify: portal.careerpathafrica.com/verify/${data.verifyCode}`, {
      x: 60, y: footerY,
      size: 8, font: regularFont, color: grey,
    });
    page.drawText(`Code: ${data.verifyCode}`, {
      x: width - 48 - boldFont.widthOfTextAtSize(`Code: ${data.verifyCode}`, 8), y: footerY,
      size: 8, font: boldFont, color: navy,
    });

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  }
}
