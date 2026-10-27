import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { MailService } from '../mail/mail.service';
import { randomBytes } from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CertificatesService {
  private readonly portalUrl: string;

  constructor(
    private prisma: PrismaService,
    private files: FilesService,
    private mail: MailService,
    private config: ConfigService,
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
      pdfUrl: c.pdfUrl,
    }));
  }

  // ── Public: verify a certificate ─────────────────────────

  async verifyCertificate(verifyCode: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { verifyCode },
      include: {
        student: { select: { email: true, firstName: true, lastName: true } },
        course: { select: { title: true } },
      },
    });

    if (!cert) throw new NotFoundException('Certificate not found or invalid code');

    const s = cert.student;
    const studentName =
      s.firstName || s.lastName
        ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim()
        : s.email;

    return {
      valid: true,
      courseId: cert.courseId,
      courseName: cert.course?.title ?? cert.courseId,
      studentEmail: s.email,
      studentName,
      issuedAt: cert.issuedAt,
      verifyCode: cert.verifyCode,
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

    const pdfBuffer = await this.generateCertificatePdf({
      studentName,
      courseTitle,
      verifyCode,
      issuedAt: new Date(),
    });

    const { url: pdfUrl } = await this.files.upload(
      {
        fieldname: 'file',
        originalname: `certificate-${verifyCode}.pdf`,
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      } as Express.Multer.File,
      'certificates',
    );

    await this.prisma.certificate.create({
      data: { studentId, courseId, verifyCode, pdfUrl },
    });

    // Send certificate earned email — non-critical
    const verifyUrl = `${this.portalUrl}/verify/${verifyCode}`;
    this.mail.sendCertificateEarned(student.email, studentName, courseTitle, verifyUrl).catch(() => {});
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

    const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await doc.embedFont(StandardFonts.Helvetica);
    const italicFont  = await doc.embedFont(StandardFonts.HelveticaOblique);

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

    // Top navy band
    page.drawRectangle({ x: 28, y: height - 90, width: width - 28, height: 90, color: navy });

    // Light inner content area
    page.drawRectangle({ x: 48, y: 50, width: width - 76, height: height - 160, color: light });

    // ── Gold accent lines ───────────────────────────────────
    page.drawRectangle({ x: 28, y: height - 93, width: width - 28, height: 3, color: gold });
    page.drawRectangle({ x: 48, y: 47,           width: width - 76, height: 3, color: gold });

    // ── Header — logo mark + title ──────────────────────────
    // "C" circle logo
    page.drawEllipse({ x: 85, y: height - 45, xScale: 22, yScale: 22, color: azure });
    page.drawText('C', {
      x: 79, y: height - 52,
      size: 22, font: boldFont, color: white,
    });

    page.drawText('CareerPath', {
      x: 115, y: height - 40,
      size: 16, font: boldFont, color: white,
    });
    page.drawText('Africa', {
      x: 218, y: height - 40,
      size: 16, font: boldFont, color: azure,
    });

    page.drawText('CERTIFICATE OF COMPLETION', {
      x: width - 380, y: height - 55,
      size: 13, font: boldFont, color: azure,
    });

    // ── Body ────────────────────────────────────────────────
    const centerX = (width + 28) / 2; // center of the right panel

    page.drawText('This is to certify that', {
      x: centerX - 75, y: height - 135,
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
      x: centerX - 83, y: height - 215,
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
      x: centerX - 60, y: height - 310,
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
      x: sigX + 10, y: height - 375,
      size: 9, font: regularFont, color: grey,
    });
    page.drawText('CareerPath Africa', {
      x: sigX + 22, y: height - 388,
      size: 9, font: boldFont, color: navy,
    });

    // ── Verification footer ─────────────────────────────────
    const footerY = 58;
    page.drawText(`Verify: portal.careerpathafrica.com/verify/${data.verifyCode}`, {
      x: 60, y: footerY,
      size: 8, font: regularFont, color: grey,
    });
    page.drawText(`Code: ${data.verifyCode}`, {
      x: width - 200, y: footerY,
      size: 8, font: boldFont, color: navy,
    });

    const pdfBytes = await doc.save();
    return Buffer.from(pdfBytes);
  }
}
