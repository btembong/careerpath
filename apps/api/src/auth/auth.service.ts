import { Prisma } from '@prisma/client';
import { resolvePrefs, resolveDisplay, NOTIFICATION_KINDS } from '../notifications/notification-prefs';
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ServiceUnavailableException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService, portalRoleFromWp } from '../wordpress/wordpress.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { OnboardingVideoService } from '../onboarding-video/onboarding-video.service';
import { ReferralsService } from '../referrals/referrals.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { CompleteTeacherOnboardingDto, TeacherProfileInput } from './dto/complete-teacher-onboarding.dto';
import { ApprovalStatus, JwtPayload, MeResponse, UserRole } from '@cpa/shared';
import { portalOnlyWpId } from '../prisma/portal-only-id';

const OTP_TTL = 600; // 10 minutes in seconds
const VERIFIED_TTL = 3600; // teacher wizard has 3 more steps after verifying, so allow an hour
const otpKey = (email: string) => `cpa:otp:${email.toLowerCase()}`;
const loginCodeKey = (email: string) => `cpa:login-code:${email.toLowerCase()}`;
const otpTriesKey = (email: string) => `cpa:otp-tries:${email.toLowerCase()}`;
const twoStepKey = (challenge: string) => `cpa:2step:${challenge}`;
/** Stored by a hash, so a leaked Redis dump can't be used to reset passwords */
const resetKey = (token: string) => `cpa:pwreset:${createHash('sha256').update(token).digest('hex')}`;
const sixDigits = () => String(randomInt(100000, 1000000));
const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, '$1•••$2');
export type SignInResult = { accessToken: string } | { twoStep: true; challenge: string; email: string };
const loginTriesKey = (email: string) => `cpa:login-code-tries:${email.toLowerCase()}`;
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
    private referrals: ReferralsService,
  ) {}

  // ── OTP ──────────────────────────────────────────────────

  async sendOtp(email: string): Promise<{ message: string }> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.set(otpKey(email), code, OTP_TTL);
    await this.redis.del(otpTriesKey(email));
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
    if (stored !== code.trim()) {
      // Five wrong tries and the code is gone
      const tries = Number((await this.redis.get(otpTriesKey(email))) ?? 0) + 1;
      if (tries >= 5) { await this.redis.del(otpKey(email)); await this.redis.del(otpTriesKey(email)); }
      else await this.redis.set(otpTriesKey(email), String(tries), OTP_TTL);
      throw new BadRequestException(tries >= 5
        ? 'Too many wrong codes. Ask for a new one.'
        : `That code isn’t right. ${5 - tries} ${5 - tries === 1 ? 'try' : 'tries'} left.`);
    }
    await this.redis.del(otpKey(email)); // consume once verified
    await this.redis.del(otpTriesKey(email));
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

  /**
   * Password sign-in. The portal checks its own copy of the password first; WordPress is only asked
   * when there is no copy yet (or it doesn't match, in case the password was changed on the website),
   * and a good answer from WordPress saves the copy. So after one sign-in, WordPress can be down.
   */
  async login(dto: LoginDto): Promise<SignInResult> {
    const existing = await this.findByEmail(dto.email);
    // From here on use the email as the account has it; a new account gets it in lower case
    dto = { ...dto, email: existing?.email ?? dto.email.trim().toLowerCase() };
    if (existing?.passwordHash && await bcrypt.compare(dto.password, existing.passwordHash)) {
      this.assertCanSignIn(existing);
      await this.prisma.userProfile.update({ where: { id: existing.id }, data: { lastActiveDate: new Date() } }).catch(() => {});
      return this.finishSignIn(existing, dto.trustToken);
    }
    const profile = await this.loginViaWordPress(dto);
    if (!profile.passwordHash || !(await bcrypt.compare(dto.password, profile.passwordHash))) await this.savePasswordCopy(profile.id, dto.password);
    return this.finishSignIn(profile, dto.trustToken);
  }

  private async loginViaWordPress(dto: LoginDto) {
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
      const PORTAL_ONLY = [UserRole.COUNTRY_REP, UserRole.SUBJECT_REVIEWER, UserRole.ORG_ADMIN] as string[];
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

    this.assertCanSignIn(profile);
    return profile;
  }

  /** Pending, paused or rejected accounts get a clear message instead of a sign-in */
  private assertCanSignIn(profile: { approvalStatus: string }) {
    // 3. Block PENDING teachers with a clear message
    if (profile.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException(
        'Your teacher application is still under review. You will be notified by email once a decision has been made.',
      );
    }

    if (profile.approvalStatus === ApprovalStatus.SUSPENDED) {
      throw new ForbiddenException('Your teacher account is paused. Please contact support.');
    }

    if (profile.approvalStatus === ApprovalStatus.REJECTED) {
      throw new ForbiddenException(
        'Your application was not approved. Please contact support if you believe this is an error.',
      );
    }

  }

  private async savePasswordCopy(userId: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.userProfile.update({ where: { id: userId }, data: { passwordHash, passwordUpdatedAt: new Date() } });
  }

  // ── Admin two-step sign-in ───────────────────────────────

  /**
   * Everyone but admins gets their token now. Admins get a code by email first, unless this computer
   * was trusted in the last 30 days.
   */
  private async finishSignIn(profile: { id: string; email: string; role: string; wpUserId: number; onboardingCompleted: boolean; firstName?: string | null }, trustToken?: string): Promise<SignInResult> {
    if (profile.role !== UserRole.ADMIN || this.trusted(profile.id, trustToken)) {
      return { accessToken: this.signToken(profile.id, profile.email, profile.role as UserRole, profile.wpUserId, profile.onboardingCompleted) };
    }
    const challenge = randomBytes(24).toString('hex');
    await this.redis.set(twoStepKey(challenge), JSON.stringify({ userId: profile.id, code: sixDigits(), tries: 0, sentAt: Date.now() }), OTP_TTL);
    await this.sendTwoStepCode(challenge);
    return { twoStep: true, challenge, email: maskEmail(profile.email) };
  }

  private trusted(userId: string, token?: string) {
    if (!token) return false;
    try {
      const p = this.jwt.verify<{ sub: string; purpose: string }>(token);
      return p.purpose === 'admin-trust' && p.sub === userId;
    } catch { return false; }
  }

  private async sendTwoStepCode(challenge: string) {
    const raw = await this.redis.get(twoStepKey(challenge));
    if (!raw) return;
    const st = JSON.parse(raw) as { userId: string; code: string };
    const user = await this.prisma.userProfile.findUnique({ where: { id: st.userId }, select: { email: true } });
    if (user) await this.mail.sendAdminCode(user.email, st.code);
  }

  async resendTwoStep(challenge: string) {
    const raw = await this.redis.get(twoStepKey(String(challenge ?? '')));
    if (!raw) throw new UnauthorizedException('That sign-in has expired. Start again with your password.');
    const st = JSON.parse(raw);
    if (Date.now() - st.sentAt < 60_000) throw new BadRequestException('Wait a minute before asking for another code.');
    st.code = sixDigits(); st.tries = 0; st.sentAt = Date.now();
    await this.redis.set(twoStepKey(challenge), JSON.stringify(st), OTP_TTL);
    await this.sendTwoStepCode(challenge);
    return { sent: true };
  }

  async verifyTwoStep(challenge: string, code: string, remember?: boolean) {
    const key = twoStepKey(String(challenge ?? ''));
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedException('That sign-in has expired. Start again with your password.');
    const st = JSON.parse(raw) as { userId: string; code: string; tries: number; sentAt: number };
    if (String(code ?? '').trim() !== st.code) {
      st.tries++;
      if (st.tries >= 5) { await this.redis.del(key); throw new UnauthorizedException('Too many wrong codes. Start again with your password.'); }
      await this.redis.set(key, JSON.stringify(st), OTP_TTL);
      throw new UnauthorizedException('That code isn’t right.');
    }
    await this.redis.del(key);
    const p = await this.prisma.userProfile.findUnique({ where: { id: st.userId } });
    if (!p || p.role !== UserRole.ADMIN) throw new UnauthorizedException('Start again with your password.');
    const accessToken = this.signToken(p.id, p.email, p.role as UserRole, p.wpUserId, p.onboardingCompleted);
    const trustToken = remember ? this.jwt.sign({ sub: p.id, purpose: 'admin-trust' }, { expiresIn: '30d' }) : undefined;
    return { accessToken, trustToken };
  }

  // ── Change password (signed in) ──────────────────────────

  async changePassword(userId: string, current: string, next: string) {
    if (typeof next !== 'string' || next.length < 8) throw new BadRequestException('Use at least 8 characters.');
    const p = await this.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!p) throw new NotFoundException('Account not found');
    let ok = false;
    if (p.passwordHash) ok = await bcrypt.compare(String(current ?? ''), p.passwordHash);
    if (!ok && p.wpUserId >= 0) ok = await this.wp.verifyPassword(p.email, String(current ?? '')).then(() => true).catch(() => false);
    if (!ok) throw new UnauthorizedException('Your current password isn’t right.');
    await this.savePasswordCopy(p.id, next);
    await this.wp.setPassword(p.wpUserId, next);
    return { changed: true };
  }

  // ── Student registration ─────────────────────────────────

  async registerStudent(dto: RegisterStudentDto): Promise<{ accessToken: string }> {
    dto.email = dto.email.trim().toLowerCase();
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

    const referredById = await this.referrals.findReferrer(dto.referralCode);

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
        referredById,
      },
    });

    await this.savePasswordCopy(profile.id, dto.password);

    // Welcome email with student ID (non-critical)
    const studentNo = `SN-${profile.id.replace(/-/g, '').slice(-8).toUpperCase()}`;
    this.mail.sendWelcomeStudent(dto.email, dto.firstName ?? '', studentNo).catch(() => {});

    return { accessToken: this.signToken(profile.id, profile.email, UserRole.STUDENT, wpUserId) };
  }

  // ── Teacher registration ─────────────────────────────────

  async registerTeacher(dto: RegisterTeacherDto, ip?: string): Promise<{ message: string }> {
    dto.email = dto.email.trim().toLowerCase();
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
        data: { wpUserId, email: dto.email, role: UserRole.TEACHER, approvalStatus: ApprovalStatus.PENDING, passwordHash: await bcrypt.hash(dto.password, 12), passwordUpdatedAt: new Date() },
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

  /** Our own reset email with a 30-minute, single-use link. Never says whether the email exists. */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const e = String(email ?? '').trim().toLowerCase();
    const p = e ? await this.findByEmail(e) : null;
    if (p && p.approvalStatus !== ApprovalStatus.REJECTED) {
      const token = randomBytes(32).toString('base64url');
      await this.redis.set(resetKey(token), p.id, 30 * 60);
      const portal = (process.env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      this.mail.sendPasswordReset(e, p.firstName ?? '', `${portal}/reset-password?token=${token}`).catch(() => {});
    }
    return { message: 'If that email is registered, a password reset link has been sent.' };
  }

  async resetPassword(dto: { token?: string; login?: string; key?: string; newPassword: string }): Promise<{ message: string }> {
    if (dto.token) {
      const key = resetKey(dto.token);
      const userId = await this.redis.get(key);
      if (!userId) throw new BadRequestException('This link has expired or was already used. Ask for a new one.');
      await this.redis.del(key);
      await this.savePasswordCopy(userId, dto.newPassword);
      const p = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { wpUserId: true } });
      if (p) await this.wp.setPassword(p.wpUserId, dto.newPassword);
      return { message: 'Password reset successfully. You can now log in.' };
    }
    // Links WordPress sent before the switch still work
    if (!dto.login || !dto.key) throw new BadRequestException('This reset link is incomplete. Ask for a new one.');
    await this.wp.resetPassword(dto.login, dto.key, dto.newPassword);
    const p = await this.findByEmail(dto.login);
    if (p) await this.savePasswordCopy(p.id, dto.newPassword);
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

  // ── Editable profile (profile pages) ─────────────────────

  async getProfile(userId: string) {
    const p = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, role: true, name: true, firstName: true, lastName: true, phone: true, avatarUrl: true, bio: true,
        countryId: true, createdAt: true, country: { select: { name: true, currency: true, repCommissionPercent: true, perStudentBonus: true } },
        teachingSubjects: { select: { name: true } },
      },
    });
    if (!p) throw new NotFoundException('User profile not found');
    const { teachingSubjects, ...rest } = p;
    return { ...rest, subjects: teachingSubjects.map(s => s.name) };
  }

  // ── Preferences (Settings) ───────────────────────────────

  async getPreferences(userId: string) {
    const p = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true, displayPrefs: true, leaderboardVisible: true, countryId: true, timezone: true },
    });
    if (!p) throw new NotFoundException('User profile not found');
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return {
      notifications: resolvePrefs(p.notificationPrefs),
      kinds: NOTIFICATION_KINDS,
      display: resolveDisplay(p.displayPrefs),
      leaderboardVisible: p.leaderboardVisible,
      countryId: p.countryId, timezone: p.timezone, countries,
    };
  }

  async updatePreferences(userId: string, dto: { notifications?: unknown; display?: unknown; leaderboardVisible?: boolean; timezone?: string }) {
    const current = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { notificationPrefs: true, displayPrefs: true } });
    if (!current) throw new NotFoundException('User profile not found');
    const data: Prisma.UserProfileUpdateInput = {};
    if (dto.notifications && typeof dto.notifications === 'object') {
      const merged = { ...resolvePrefs(current.notificationPrefs) } as Record<string, { inApp: boolean; email: boolean }>;
      for (const [k, v] of Object.entries(dto.notifications as Record<string, any>)) {
        if (!merged[k] || !v || typeof v !== 'object') continue;
        merged[k] = { inApp: v.inApp ?? merged[k].inApp, email: v.email ?? merged[k].email };
      }
      data.notificationPrefs = resolvePrefs(merged);
    }
    if (dto.display && typeof dto.display === 'object') {
      data.displayPrefs = resolveDisplay({ ...resolveDisplay(current.displayPrefs), ...(dto.display as object) });
    }
    if (dto.leaderboardVisible !== undefined) data.leaderboardVisible = !!dto.leaderboardVisible;
    if (dto.timezone !== undefined) data.timezone = dto.timezone ? String(dto.timezone).slice(0, 64) : null;
    await this.prisma.userProfile.update({ where: { id: userId }, data });
    return this.getPreferences(userId);
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
      avatarUrl: profile.avatarUrl ?? null,
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

  // ── Email-code sign-in (accounts without a WordPress user) ──

  /**
   * School admins and other portal-only accounts have no WordPress password: they sign in with a
   * code sent to their email. The answer is the same whether or not the account exists.
   */
  async sendLoginCode(email: string): Promise<{ message: string }> {
    const e = String(email ?? '').trim().toLowerCase();
    const profile = e ? await this.findByEmail(e) : null;
    // Anyone but an admin: getting into the inbox proves who they are. Admins use their password, then a code.
    if (profile && profile.role !== UserRole.ADMIN && profile.approvalStatus === ApprovalStatus.APPROVED && !profile.deletedAt) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await this.redis.set(loginCodeKey(e), code, OTP_TTL);
      await this.redis.del(loginTriesKey(e));
      await this.mail.sendOtp(e, code);
    }
    return { message: 'If that email has a CareerPath account, we’ve sent a code.' };
  }

  async loginWithCode(email: string, code: string): Promise<SignInResult> {
    const e = String(email ?? '').trim().toLowerCase();
    const stored = await this.redis.get(loginCodeKey(e));
    if (!stored) throw new UnauthorizedException('That code has expired. Ask for a new one.');
    if (stored !== String(code ?? '').trim()) {
      // Five wrong tries and the code is gone
      const tries = Number((await this.redis.get(loginTriesKey(e))) ?? 0) + 1;
      if (tries >= 5) { await this.redis.del(loginCodeKey(e)); await this.redis.del(loginTriesKey(e)); }
      else await this.redis.set(loginTriesKey(e), String(tries), OTP_TTL);
      throw new UnauthorizedException(tries >= 5 ? 'Too many wrong codes. Ask for a new one.' : 'That code isn’t right.');
    }
    await this.redis.del(loginCodeKey(e)); await this.redis.del(loginTriesKey(e));
    const profile = await this.findByEmail(e);
    if (!profile || profile.deletedAt) throw new UnauthorizedException('That code has expired. Ask for a new one.');
    if (profile.role === UserRole.ADMIN) throw new UnauthorizedException('Admins sign in with their password, then a code.');
    this.assertCanSignIn(profile);
    await this.prisma.userProfile.update({ where: { id: profile.id }, data: { lastActiveDate: new Date() } }).catch(() => {});
    return this.finishSignIn(profile);
  }

  // ── Google SSO ───────────────────────────────────────────

  /**
   * Checks a Google ID token with Google and returns who it belongs to. Nothing the browser says about the
   * person is trusted: only what Google confirms for our client id.
   */
  private async verifyGoogle(credential: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ServiceUnavailableException('Google sign-in isn’t set up yet.');
    if (typeof credential !== 'string' || credential.length < 100 || credential.length > 4096) throw new UnauthorizedException('Google sign-in failed. Please try again.');
    let info: { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; exp?: string; name?: string; picture?: string };
    try {
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new UnauthorizedException('Google sign-in failed. Please try again.');
      info = await r.json();
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new ServiceUnavailableException('Couldn’t reach Google. Please try again.');
    }
    const verified = info.email_verified === true || info.email_verified === 'true';
    const fresh = Number(info.exp) * 1000 > Date.now();
    if (info.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss ?? '') || !info.sub || !info.email || !verified || !fresh) {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
    return { googleId: info.sub, email: info.email.toLowerCase(), name: info.name, avatarUrl: info.picture };
  }

  async googleLogin(body: { credential: string }): Promise<SignInResult> {
    const dto = await this.verifyGoogle(body?.credential);
    let profile = await this.prisma.userProfile.findFirst({
      where: { OR: [{ googleId: dto.googleId }, { email: dto.email }] },
    });

    if (!profile) {
      // Create a new student account — SSO users get wpUserId = -1 (sentinel for SSO-only accounts)
      profile = await this.prisma.userProfile.create({
        data: {
          wpUserId: await portalOnlyWpId(this.prisma), // no WordPress user: negative, unique
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
      // Google has confirmed this email belongs to them, so the existing account can be linked
      await this.prisma.userProfile.update({ where: { id: profile.id }, data: { googleId: dto.googleId } });
    } else if (profile.googleId !== dto.googleId) {
      throw new UnauthorizedException('This email is linked to a different Google account.');
    }

    if (profile.approvalStatus === ApprovalStatus.PENDING) {
      throw new ForbiddenException('Your application is still under review.');
    }

    return this.finishSignIn(profile);
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

  /**
   * Before sign-up: does this email already have an account, in the portal or on the website?
   * Sign-up would refuse it anyway; asking first lets the page point the person to sign in instead.
   */
  async checkEmail(email: string): Promise<{ exists: 'portal' | 'website' | null }> {
    const e = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new BadRequestException('Enter a valid email address.');
    const p = await this.prisma.userProfile.findFirst({ where: { email: { equals: e, mode: 'insensitive' }, deletedAt: null }, select: { id: true } });
    if (p) return { exists: 'portal' };
    return { exists: (await this.wp.emailExists(e)) ? 'website' : null };
  }

  private async assertEmailNotTaken(email: string): Promise<void> {
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('An account with this email already exists.');
  }

  /**
   * The account for an email, whatever capitals it was typed with. An exact match wins, so two old
   * accounts that differ only in capitals each keep signing in as before.
   */
  private async findByEmail(email: string) {
    const e = String(email ?? '').trim();
    if (!e) return null;
    return (await this.prisma.userProfile.findUnique({ where: { email: e } }))
      ?? this.prisma.userProfile.findFirst({ where: { email: { equals: e, mode: 'insensitive' } }, orderBy: { createdAt: 'asc' } });
  }
}
