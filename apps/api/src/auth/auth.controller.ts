import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  Ip,
  Delete,
  Param,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SessionsService, sidOf } from './sessions.service';
import { AuthenticatorService } from './authenticator.service';
import { LoginDto } from './dto/login.dto';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { UserRole } from '@cpa/shared';
import { CompleteTeacherOnboardingDto } from './dto/complete-teacher-onboarding.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserProfile } from '@prisma/client';
import { PlatformCoursesService } from '../platform-courses/platform-courses.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly platformCourses: PlatformCoursesService,
    private readonly sessions: SessionsService,
    private readonly authenticator: AuthenticatorService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 attempts per minute per IP
  @ApiOperation({ summary: 'Login with email + password (validates against WordPress)' })
  @ApiOkResponse({ description: 'Returns a role-aware JWT' })
  @ApiForbiddenResponse({ description: 'Teacher application still pending or rejected' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register/student')
  @ApiOperation({ summary: 'Register a new student account' })
  @ApiCreatedResponse({ description: 'Account created; returns JWT for immediate login' })
  @ApiConflictResponse({ description: 'Email already registered' })
  registerStudent(@Body() dto: RegisterStudentDto) {
    return this.authService.registerStudent(dto);
  }

  @Post('register/teacher')
  @ApiOperation({
    summary: 'Submit a teacher application (multi-step wizard on frontend, one payload here)',
  })
  @ApiCreatedResponse({ description: 'Application received; account set to PENDING' })
  @ApiConflictResponse({ description: 'Email already registered' })
  registerTeacher(@Body() dto: RegisterTeacherDto, @Ip() ip: string) {
    return this.authService.registerTeacher(dto, ip);
  }

  @Post('register/check')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Before sign-up: does this email already have an account (portal or website)?' })
  checkEmail(@Body() body: { email: string }) {
    return this.authService.checkEmail(body?.email);
  }

  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // 5 OTP sends per minute per IP
  @ApiOperation({ summary: 'Send a 6-digit OTP to an email for verification (teacher wizard)' })
  sendOtp(@Body('email') email: string) {
    return this.authService.sendOtp(email);
  }

  @Get('otp/dev')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: '[DEV ONLY] Peek at the current OTP for an email' })
  async devPeekOtp(@Query('email') email: string) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('Not available in production');
    const result = await this.authService.devPeekOtp(email);
    if (!result) throw new ForbiddenException('No active OTP for that email');
    return result;
  }

  @Post('mail/test')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: '[DEV ONLY] Send a test welcome-student email to any address' })
  async devTestMail(@Body('email') email: string) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('Not available in production');
    if (!email) throw new ForbiddenException('email body field required');
    await this.authService.devSendTestWelcome(email);
    return { sent: true, to: email };
  }

  @Post('login/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Email me a sign-in code (any account except admins)' })
  sendLoginCode(@Body('email') email: string) {
    return this.authService.sendLoginCode(email);
  }

  @Post('login/code/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Sign in with the emailed code' })
  loginWithCode(@Body('email') email: string, @Body('code') code: string, @Body('trustToken') trustToken?: string) {
    return this.authService.loginWithCode(email, code, trustToken);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 OTP attempts per minute per IP
  @ApiOperation({ summary: 'Verify a 6-digit OTP code (consumes the code on success)' })
  async verifyOtp(@Body('email') email: string, @Body('code') code: string) {
    return this.authService.verifyOtp(email, code);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a 30-minute password reset link' })
  @ApiOkResponse({ description: 'Always returns success (email existence not confirmed)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password with the token from our email (or an older WordPress link)' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('2step/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Two-step sign-in: a code from the authenticator app, a backup code, or the emailed code' })
  verifyTwoStep(@Body() body: { challenge: string; code: string; remember?: boolean }) {
    return this.authService.verifyTwoStep(body?.challenge, body?.code, !!body?.remember);
  }

  @Post('2step/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Two-step sign-in: email a code (again, or instead of the app), once a minute' })
  resendTwoStep(@Body() body: { challenge: string }) {
    return this.authService.resendTwoStep(body?.challenge);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Change your password (needs the current one)' })
  changePassword(@CurrentUser() user: UserProfile, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(user.id, body?.currentPassword, body?.newPassword);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Sign in or register with a Google ID token (checked with Google)' })
  googleLogin(@Body() body: { credential: string; trustToken?: string }) {
    return this.authService.googleLogin(body);
  }

  @Get('google/config')
  @ApiOperation({ summary: 'Whether Google sign-in is switched on, and the public client id the button needs' })
  googleConfig() {
    return { clientId: process.env.GOOGLE_CLIENT_ID || null };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current profile, active packages, and wallet balance' })
  getMe(@CurrentUser() user: UserProfile) {
    return this.authService.getMe(user.id);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Editable profile fields: name, phone, photo, bio, country and subjects' })
  getProfile(@CurrentUser() user: UserProfile) {
    return this.authService.getProfile(user.id);
  }

  @Get('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Notification, display and privacy preferences' })
  getPreferences(@CurrentUser() user: UserProfile) {
    return this.authService.getPreferences(user.id);
  }

  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update notification, display and privacy preferences' })
  updatePreferences(
    @CurrentUser() user: UserProfile,
    @Body() body: { notifications?: unknown; display?: unknown; leaderboardVisible?: boolean; timezone?: string; quiet?: { on?: boolean; from?: string; to?: string }; pauseMinutes?: number | null },
  ) {
    return this.authService.updatePreferences(user.id, body ?? {});
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update display name, phone, avatar URL, bio, or social links' })
  updateMe(
    @CurrentUser() user: UserProfile,
    @Body('name') name?: string,
    @Body('firstName') firstName?: string,
    @Body('lastName') lastName?: string,
    @Body('phone') phone?: string,
    @Body('avatarUrl') avatarUrl?: string,
    @Body('bio') bio?: string,
    @Body('linkedinUrl') linkedinUrl?: string,
    @Body('websiteUrl') websiteUrl?: string,
    @Body('countryId') countryId?: string,
  ) {
    return this.authService.updateMe(user.id, { name, firstName, lastName, phone, avatarUrl, bio, linkedinUrl, websiteUrl, countryId });
  }

  @Post('teacher-onboarding')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'WP tutors: complete the teacher profile on first portal login' })
  completeTeacherOnboarding(
    @CurrentUser() user: UserProfile,
    @Body() dto: CompleteTeacherOnboardingDto,
    @Ip() ip: string,
  ) {
    return this.authService.completeTeacherOnboarding(user.id, dto, ip);
  }

  @Post('onboarding')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save student onboarding data (profile + programme interests + level)' })
  async saveOnboarding(
    @CurrentUser() user: UserProfile,
    @Body('programmeIds') programmeIds: string[],
    @Body('levelId')   levelId?: string,
    @Body('firstName') firstName?: string,
    @Body('lastName')  lastName?: string,
    @Body('phone')     phone?: string,
    @Body('countryId') countryId?: string,
  ) {
    await this.platformCourses.saveOnboarding(user.id, {
      programmeIds: programmeIds ?? [],
      levelId, firstName, lastName, phone, countryId,
    });
    return this.authService.issueTokenForUser(user.id, sidOf(user));
  }

  // ── Settings → Where you're signed in ───────────────────

  @Get('me/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Browsers and apps signed in to this account, this one first' })
  mySessions(@CurrentUser() user: UserProfile) {
    return this.sessions.list(user.id, sidOf(user));
  }

  @Post('me/sessions/sign-out-others')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out everywhere else; returns a fresh token for this browser' })
  signOutOthers(@CurrentUser() user: UserProfile) {
    return this.authService.signOutOthers(user.id, sidOf(user));
  }

  @Post('me/sessions/end-current')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Signing out of this browser: ends its sign-in' })
  endCurrent(@CurrentUser() user: UserProfile) {
    return this.sessions.endCurrent(sidOf(user));
  }

  @Delete('me/sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Forget one sign-in: it stops working, and a trusted computer asks for the code again' })
  endSession(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.sessions.end(user.id, id, sidOf(user));
  }

  // ── Settings → Authenticator app ────────────────────────

  @Get('me/authenticator')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether the authenticator app is on, backup codes left, and (admins) the date it is required from' })
  authenticatorStatus(@CurrentUser() user: UserProfile) {
    return this.authenticator.status(user);
  }

  @Post('me/authenticator/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'A QR code and key to add CareerPath Africa to an authenticator app (nothing changes until confirmed)' })
  authenticatorStart(@CurrentUser() user: UserProfile) {
    return this.authenticator.start(user);
  }

  @Post('me/authenticator/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'The first code from the app: switches it on (or moves it to a new phone) and returns 10 backup codes, shown once' })
  authenticatorConfirm(@CurrentUser() user: UserProfile, @Body('code') code: string) {
    return this.authenticator.confirm(user, code);
  }

  @Post('me/authenticator/backup-codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'New backup codes (needs a code from the app); the old ones stop working' })
  authenticatorBackupCodes(@CurrentUser() user: UserProfile, @Body('code') code: string) {
    return this.authenticator.newBackupCodes(user, code);
  }

  @Post('me/authenticator/off')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Switch the authenticator app off (needs a code; not for admins)' })
  authenticatorOff(@CurrentUser() user: UserProfile, @Body('code') code: string) {
    return this.authenticator.disable(user, code);
  }

  @Post('admin/users/:id/authenticator/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Clear someone’s authenticator app (a lost phone); they set it up again' })
  authenticatorReset(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.authenticator.reset(user, id);
  }
}
