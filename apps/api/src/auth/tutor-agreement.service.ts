import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TUTOR_AGREEMENT, TUTOR_AGREEMENTS } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { tutorAgreementPdf } from './tutor-agreement-pdf';

const nameOf = (u: { name: string | null; firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;
const fileName = (name: string) => `CareerPath-Tutor-Agreement-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tutor'}.pdf`;

/**
 * The tutor's signed copy of the Tutor Offer Letter & Content Ownership Agreement: a PDF of the version they
 * accepted, with when and from where. Emailed when they accept, and downloadable from Settings and by admins.
 */
@Injectable()
export class TutorAgreementService {
  private readonly logger = new Logger(TutorAgreementService.name);

  constructor(private prisma: PrismaService, private mail: MailService, private audit: AuditService) {}

  async pdf(userId: string): Promise<{ bytes: Uint8Array; fileName: string; email: string; firstName: string | null; name: string }> {
    const u = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, firstName: true, lastName: true, agreementAcceptedAt: true, agreementVersion: true, agreementIp: true, deletedAt: true },
    });
    if (!u || u.deletedAt) throw new NotFoundException('Person not found');
    if (!u.agreementAcceptedAt) throw new BadRequestException('No tutor agreement has been accepted on this account.');
    const text = TUTOR_AGREEMENTS[u.agreementVersion ?? ''] ?? TUTOR_AGREEMENT;
    const name = nameOf(u);
    const bytes = await tutorAgreementPdf(text, {
      name, email: u.email, reference: `TCH-${u.id.replace(/-/g, '').slice(-8).toUpperCase()}`,
      acceptedAt: u.agreementAcceptedAt, ip: u.agreementIp, issuedAt: new Date(),
    });
    return { bytes, fileName: fileName(name), email: u.email, firstName: u.firstName, name };
  }

  /** Email the tutor their copy, as a PDF attachment */
  async email(userId: string, reason: 'accepted' | 'asked' | 'admin' = 'accepted') {
    const p = await this.pdf(userId);
    const first = reason === 'accepted'
      ? 'Thank you for applying to teach with CareerPath Africa. Attached is your copy of the Tutor Offer Letter & Content Ownership Agreement you accepted, with the date and time you accepted it.'
      : 'Here is your copy of the Tutor Offer Letter & Content Ownership Agreement you accepted, with the date and time you accepted it.';
    await this.mail.sendWithAttachment(p.email, 'Your signed tutor agreement', {
      badge: 'Tutor agreement', title: 'Your copy of the tutor agreement', firstName: p.firstName,
      text: `${first}\n\nPlease keep it for your records. It covers how you work with us, how you’re paid, and who owns the lessons you upload. You can download it again at any time in Settings → Your data.`,
      cta: 'Read it online', href: '/legal/tutor-agreement',
    }, 'teachers', [{ name: p.fileName, content: p.bytes }]);
    return { sent: true, to: p.email };
  }

  /** After an application: never blocks it */
  emailAfterAccepting(userId: string) {
    this.email(userId, 'accepted').catch(err => this.logger.warn(`Tutor agreement email for ${userId} failed: ${err?.message}`));
  }

  /** Tutors who accepted the agreement, for sending copies to those who signed before this existed */
  async signed() {
    const rows = await this.prisma.userProfile.findMany({
      where: { role: UserRole.TEACHER, agreementAcceptedAt: { not: null }, deletedAt: null },
      select: { id: true, email: true },
    });
    return rows.filter(r => !/\.(test|invalid|example)$/i.test(r.email));
  }

  /** One by one, as Brevo rate-limits bursts */
  async emailAll(adminId: string) {
    const rows = await this.signed();
    let sent = 0, failed = 0;
    for (const r of rows) {
      try { await this.email(r.id, 'admin'); sent++; } catch { failed++; }
    }
    this.audit.log(adminId, 'tutor-agreement.copies-sent', 'UserProfile', undefined, undefined, { sent, failed });
    return { sent, failed };
  }
}
