import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService, portalRoleFromWp } from '../wordpress/wordpress.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { OnboardingVideoService } from '../onboarding-video/onboarding-video.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { CompleteTeacherOnboardingDto, TeacherProfileInput } from './dto/complete-teacher-onboarding.dto';
import { ApprovalStatus, JwtPayload, MeResponse, UserRole } from '@cpa/shared';

const OTP_TTL = 600; // 10 minutes in seconds
const VERIFIED_TTL = 3600; // teacher wizard has 3 more steps after verifying, so allow an hour
const otpKey = (email: string) => `cpa:otp:${email.toLowerCase()}`;
export const verifiedKey = (email: string) => `cpa:otp-verified:${email.toLowerCase()}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private wp: WordPressService,
    private mail: MailService,
    private redis: RedisService,
    private onboardingVideo: OnboardingVideoService,
  ) {}

  // ── OTP ──────────────────────────────────────────────────

  async sendOtp(email: string): Promise<{ message: string }> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(otpKey(email), code, OTP_TTL);
    await this.mail.sendOtp(email, code);
    return { message: 'Verification code sent to your email.' };
  }

  /** DEV ONLY — fires a real welcome-student email so we can verify Brevo delivery */
  async devSendTestWelcome(email: string): Promise<void> {
    const studentNo = 'SN-TESTDEV1';
    await this.mail.sendWelcomeStudent(email, 'Test User', studentNo);
  }

  /** DEV ONLY — returns the pending OTP for an email (never exposed in production) */
  async devPeekOtp(email: string): Promise<{ code: string } | null> {
    const code = await this.redis.get(otpKey(email));
    if (!code) return null;
    return { code };
  }

  async verifyOtp(email: string, code: string): Promise<{ verified: boolean }> {
    const stored = await this.redis.get(otpKey(email));
    if (!stored) throw new BadRequestException('No OTP found for this email. Please request a new code.');
    if (stored !== code.trim()) throw new BadRequestException('Incorrect verification code.');
    await this.redis.del(otpKey(email)); // consume once verified
    await this.redis.set(verifiedKey(email), '1', VERIFIED_TTL);
    return { verified: true };
  }

  async isEmailVerified(email: string): Promise<boolean> {
    return (await this.redis.get(verifiedKey(email))) === '1';
  }

  private async assertEmailVerified(email: string): Promise<void> {
    if (!(await this.isEmailVerified(email))) {
      throw new BadRequestException('Please verify your email address before creating an account.');
    }
  }

  // ── Login ────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    // 1. Verify password against WordPress (server-to-server)
    const wpUser = await this.wp.verifyPassword(dto.email, dto.password);

    // 2. Find or lazily create the UserProfile in our DB
    let profile = await this.prisma.userProfile.findUnique({
      where: { email: dto.email },
    });

    const wpDerivedRole = portalRoleFromWp(wpUser.roles) as UserRole;

    if (!profile) {
      // First login — create profile with WP-derived role.
      // WP tutors already teach on the live site, so they're approved and complete
      // their teacher profile via /teacher/onboarding instead of an approval queue.
      const avatarUrl = wpUser.avatar_urls?.['96'] ?? wpUser.avatar_urls?.['48'] ?? null;
      profile = await this.prisma.userProfile.create({
        data: {
          wpUserId: wpUser.id,
          email: dto.email,
          role: wpDerivedRole,
          approvalStatus: ApprovalStatus.APPROVED,
          firstName: wpUser.first_name || null,
          lastName: wpUser.last_name || null,
          name: wpUser.name || null,
          avatarUrl,
        },
      });
    } else {
      // Never overwrite portal-only roles (COUNTRY_REP, SUBJECT_REVIEWER) — those
      // are managed exclusively by admins in this portal, not by WordPress.
      const PORTAL_ONLY = [UserRole.COUNTRY_REP, UserRole.SUBJECT_REVIEWER] as string[];
      const isPortalOnly = PORTAL_ONLY.includes(profile.role);

      // Sync role in BOTH directions (up and down) to match WP source of truth.
      // Portal-only roles are never overwritten — they are managed by admins only.
      if (!isPortalOnly && wpDerivedRole !== profile.role) {
        profile = await this.prisma.userProfile.update({
          where: { id: profile.id },
          data: { role: wpDerivedRole },
        });
      }

      // Repair stale wpUserIds (e.g. profiles created while the WP dev bypass was active)
      if (profile.wpUserId !== wpUser.id) {
        const holder = await this.prisma.userProfile.findUnique({ where: { wpUserId: wpUser.id } });
        if (holder) {
          this.logger.warn(
            `wpUserId sync skipped for ${profile.email}: WP id ${wpUser.id} already belongs to profile ${holder.id}`,
          );
        } else {
          this.logger.log(`Syncing wpUserId for ${profile.email}: ${profile.wpUserId} → ${wpUser.id}`);
          profile = await this.prisma.userProfile.update({
            where: { id: profile.id },
            data: { wpUserId: wpUser.id },
          });
        }
      }

      // WP teachers imported before tutors were auto-approved sit in PENDING with no
      // application to review. Portal applicants always have one, so they're unaffected.
      if (profile.role === UserRole.TEACHER && profile.approvalStatus === ApprovalStatus.PENDING) {
        const application = await this.prisma.teacherApplication.findUnique({ where: { userId: profile.id } });
        if (!application) {
          profile = await this.prisma.userProfile.update({
            where: { id: profile.id },
            data: { approvalStatus: ApprovalStatus.APPROVED },
          });
        }
      }
    }

    // 3. Block PENDING teachers with a clear message
    if (profile.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException(
        'Your teacher application is still under review. You will be notified by email once a decision has been made.',
      );
    }

    if (profile.approvalStatus === ApprovalStatus.REJECTED) {
      throw new ForbiddenException(
        'Your application was not approved. Please contact support if you believe this is an error.',
      );
    }

    // 4. Issue JWT
    return { accessToken: this.signToken(profile.id, profile.email, profile.role as UserRole, wpUser.id, profile.onboardingCompleted) };
  }

  // ── Student registration ─────────────────────────────────

  async registerStudent(dto: RegisterStudentDto): Promise<{ accessToken: string }> {
    await this.assertEmailVerified(dto.email);
    await this.assertEmailNotTaken(dto.email);

    // Create user in WordPress first — every account must be a real WP user
    const wpUserId = await this.wp.createUser({
      username: dto.email,
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      wpRole: 'subscriber',
    });

    const profile = await this.prisma.userProfile.create({
      data: {
        wpUserId,
        email:          dto.email,
        role:           UserRole.STUDENT,
        approvalStatus: ApprovalStatus.APPROVED,
        countryId:      dto.countryId  || null,
        firstName:      dto.firstName  || null,
        lastName:       dto.lastName   || null,
        phone:          dto.phone      || null,
      },
    });

    // Welcome email with student ID (non-critical)
    const studentNo = `SN-${profile.id.replace(/-/g, '').slice(-8).toUpperCase()}`;
    this.mail.sendWelcomeStudent(dto.email, dto.firstName ?? '', studentNo).catch(() => {});

    return { accessToken: this.signToken(profile.id, profile.email, UserRole.STUDENT, wpUserId) };
  }

  // ── Teacher registration ─────────────────────────────────

  async registerTeacher(dto: RegisterTeacherDto, ip?: string): Promise<{ message: string }> {
    await this.assertEmailVerified(dto.email);
    await this.assertEmailNotTaken(dto.email);
    // Validate before creating the WP user so a bad payload can't orphan a WP account
    await this.assertTeacherRefsValid(dto);

    const wpUserId = await this.wp.createUser({
      username: dto.email,
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      wpRole: 'author',
    });

    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.create({
        data: { wpUserId, email: dto.email, role: UserRole.TEACHER, approvalStatus: ApprovalStatus.PENDING },
      });
      await this.writeTeacherProfile(tx, profile.id, dto, ip);
    });

    // Welcome email to teacher (pending state)
    this.mail.sendWelcomeTeacher(dto.email, dto.firstName ?? '').catch(() => {});

    return {
      message:
        'Your application has been received and is under review. You will be notified by email once a decision has been made.',
    };
  }

  // ── Teacher onboarding (WP tutors completing their profile) ─

  async completeTeacherOnboarding(
    userId: string,
    dto: CompleteTeacherOnboardingDto,
    ip?: string,
  ): Promise<{ accessToken: string }> {
    if (!dto.agreementAccepted) {
      throw new BadRequestException('You must accept the tutor agreement to continue.');
    }
    await this.assertTeacherRefsValid(dto);

    await this.prisma.$transaction(async (tx) => {
      await this.writeTeacherProfile(tx, userId, dto, ip);
      await tx.userProfile.update({ where: { id: userId }, data: { onboardingCompleted: true } });
    });

    return this.issueTokenForUser(userId);
  }

  // ── Shared teacher profile helpers ───────────────────────

  private async assertTeacherRefsValid(dto: TeacherProfileInput): Promise<void> {
    const subjectIds = dto.teachingSubjectIds ?? [];
    const programmeIds = dto.teachingProgrammeIds ?? [];
    const [subjects, programmes, country] = await Promise.all([
      subjectIds.length ? this.prisma.subject.count({ where: { id: { in: subjectIds } } }) : 0,
      programmeIds.length ? this.prisma.programme.count({ where: { id: { in: programmeIds } } }) : 0,
      dto.countryId ? this.prisma.country.findUnique({ where: { id: dto.countryId }, select: { id: true } }) : null,
    ]);
    if (subjects !== new Set(subjectIds).size) throw new BadRequestException('One or more subjects are invalid.');
    if (programmes !== new Set(programmeIds).size) throw new BadRequestException('One or more programmes are invalid.');
    if (dto.countryId && !country) throw new BadRequestException('Selected country is invalid.');
  }

  /** Writes the profile fields + application record shared by portal sign-ups and WP-tutor onboarding. */
  private async writeTeacherProfile(tx: any, userId: string, dto: TeacherProfileInput, ip?: string): Promise<void> {
    const subjectIds = dto.teachingSubjectIds ?? [];
    const programmeIds = dto.teachingProgrammeIds ?? [];

    await tx.userProfile.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone ?? null,
        bio: dto.bio,
        linkedinUrl: dto.linkedinUrl ?? null,
        websiteUrl: dto.websiteUrl ?? null,
        ...(dto.countryId && { countryId: dto.countryId }),
        teachingSubjects: { set: subjectIds.map(id => ({ id })) },
        teachingProgrammes: { set: programmeIds.map(id => ({ id })) },
        ...(dto.agreementAccepted && {
          agreementAcceptedAt: new Date(),
          agreementVersion: dto.agreementVersion ?? 'v1.0',
          agreementIp: ip ?? null,
        }),
      },
    });

    const application = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      subjectAreas: dto.subjectAreas ?? [],
      teachingSubjectIds: subjectIds,
      teachingProgrammeIds: programmeIds,
      yearsExperience: dto.yearsExperience,
      qualification: dto.qualification,
      teachingModality: dto.teachingModality,
      bio: dto.bio,
      documentUrl: dto.documentUrl,
      linkedinUrl: dto.linkedinUrl,
      websiteUrl: dto.websiteUrl,
    };
    await tx.teacherApplication.upsert({
      where: { userId },
      create: { userId, ...application },
      update: application,
    });
  }

  // ── Password reset ───────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    // Delegate to WordPress; never confirm or deny whether the email exists
    await this.wp.triggerPasswordReset(email);
    return { message: 'If that email is registered, a password reset link has been sent.' };
  }

  async resetPassword(login: string, key: string, newPassword: string): Promise<{ message: string }> {
    await this.wp.resetPassword(login, key, newPassword);
    return { message: 'Password reset successfully. You can now log in.' };
  }

  // ── Update profile ───────────────────────────────────────

  async updateMe(userId: string, dto: {
    name?: string; phone?: string; avatarUrl?: string;
    firstName?: string; lastName?: string; countryId?: string;
    bio?: string; linkedinUrl?: string; websiteUrl?: string;
  }): Promise<{ updated: boolean }> {
    await this.prisma.userProfile.update({
      where: { id: userId },
      data: {
        ...(dto.name        !== undefined && { name: dto.name }),
        ...(dto.phone       !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl   !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.firstName   !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName    !== undefined && { lastName: dto.lastName }),
        ...(dto.countryId   !== undefined && { countryId: dto.countryId }),
        ...(dto.bio         !== undefined && { bio: dto.bio }),
        ...(dto.linkedinUrl !== undefined && { linkedinUrl: dto.linkedinUrl }),
        ...(dto.websiteUrl  !== undefined && { websiteUrl: dto.websiteUrl }),
      },
    });
    return { updated: true };
  }

  // ── Me ───────────────────────────────────────────────────

  async getMe(userId: string): Promise<MeResponse> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      include: {
        programmeInterests: { select: { id: true } },
        teacherApplication: { select: { id: true } },
      },
    });
    if (!profile) throw new NotFoundException('User profile not found');

    // Active packages: query unexpired PackagePurchase rows, never a cached flag
    const now = new Date();
    const purchases = await this.prisma.packagePurchase.findMany({
      where: {
        studentId: userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: { package: { select: { name: true } } },
    });

    const activePackages = purchases.map((p) => ({
      id: p.packageId,
      name: p.package.name,
      expiresAt: p.expiresAt?.toISOString() ?? null,
    }));

    // Directly purchased courses (individual course purchases)
    const coursePurchases = await this.prisma.coursePurchase.findMany({
      where: {
        studentId: userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { courseId: true },
    });
    const purchasedCourseIds = coursePurchases.map((c) => c.courseId);

    // Wallet balance (teachers, reviewers, country reps)
    let walletBalance: number | undefined;
    let walletCurrency: string | undefined;
    const rolesWithWallet: UserRole[] = [UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP];
    if (rolesWithWallet.includes(profile.role as UserRole)) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      if (wallet) {
        walletBalance = wallet.balance;
        walletCurrency = wallet.currency;
      }
    }

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name ?? undefined,
      firstName: profile.firstName ?? undefined,
      lastName:  profile.lastName  ?? undefined,
      phone:     profile.phone     ?? undefined,
      role: profile.role as UserRole,
      approvalStatus: profile.approvalStatus as ApprovalStatus,
      countryId: profile.countryId,
      levelId: (profile as any).currentLevelId ?? null,
      onboardingCompleted: profile.onboardingCompleted,
      programmeInterestIds: (profile as any).programmeInterests?.map((p: { id: string }) => p.id),
      activePackages,
      purchasedCourseIds,
      walletBalance,
      walletCurrency,
      agreementAcceptedAt: profile.agreementAcceptedAt?.toISOString() ?? null,
      agreementVersion: profile.agreementVersion ?? null,
      ...(profile.role === UserRole.TEACHER && {
        teacherProfileComplete: !!profile.teacherApplication,
        onboardingVideoPending: await this.onboardingVideo.isPending(profile.id, profile.role),
      }),
    };
  }

  // ── Google SSO ───────────────────────────────────────────

  async googleLogin(dto: { googleId: string; email: string; name?: string; avatarUrl?: string }): Promise<{ accessToken: string }> {
    let profile = await this.prisma.userProfile.findFirst({
      where: { OR: [{ googleId: dto.googleId }, { email: dto.email }] },
    });

    if (!profile) {
      // Create a new student account — SSO users get wpUserId = -1 (sentinel for SSO-only accounts)
      profile = await this.prisma.userProfile.create({
        data: {
          wpUserId: -(Date.now()), // negative sentinel, unique
          email: dto.email, googleId: dto.googleId,
          name: dto.name ?? null, avatarUrl: dto.avatarUrl ?? null,
          role: UserRole.STUDENT, approvalStatus: ApprovalStatus.APPROVED,
        },
      });
      // Welcome email for new Google SSO student (non-critical)
      const ssoStudentNo = `SN-${profile.id.replace(/-/g, '').slice(-8).toUpperCase()}`;
      const firstName = dto.name?.split(' ')[0] ?? '';
      this.mail.sendWelcomeStudent(dto.email, firstName, ssoStudentNo).catch(() => {});
    } else if (!profile.googleId) {
      await this.prisma.userProfile.update({ where: { id: profile.id }, data: { googleId: dto.googleId } });
    }

    if (profile.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException('Your application is still under review.');
    }

    return { accessToken: this.signToken(profile.id, profile.email, profile.role as UserRole, profile.wpUserId, profile.onboardingCompleted) };
  }

  // ── Helpers ──────────────────────────────────────────────

  /** Re-issue a fresh JWT for an existing user (used after onboarding completes). */
  async issueTokenForUser(userId: string): Promise<{ accessToken: string }> {
    const profile = await this.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!profile) throw new NotFoundException('User profile not found');
    return {
      accessToken: this.signToken(
        profile.id,
        profile.email,
        profile.role as UserRole,
        profile.wpUserId,
        profile.onboardingCompleted,
      ),
    };
  }

  private signToken(sub: string, email: string, role: UserRole, wpUserId: number, onboardingCompleted = false): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub, email, role, wpUserId, onboardingCompleted };
    return this.jwt.sign(payload);
  }

  private async assertEmailNotTaken(email: string): Promise<void> {
    const existing = await this.prisma.userProfile.findUnique({ where: { email } });
    if (existing) throw new ConflictException('An account with this email already exists.');
  }
}
