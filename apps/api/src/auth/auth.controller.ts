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
  @ApiOperation({ summary: 'Email me a sign-in code (school admins and other accounts without a WordPress password)' })
  sendLoginCode(@Body('email') email: string) {
    return this.authService.sendLoginCode(email);
  }

  @Post('login/code/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Sign in with the emailed code' })
  loginWithCode(@Body('email') email: string, @Body('code') code: string) {
    return this.authService.loginWithCode(email, code);
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
  @ApiOperation({ summary: "Trigger WordPress's password reset email" })
  @ApiOkResponse({ description: 'Always returns success (email existence not confirmed)' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Complete WordPress's password reset with the key from the email" })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.login, dto.key, dto.newPassword);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in or register with a Google ID token (SSO)' })
  googleLogin(@Body() body: { googleId: string; email: string; name?: string; avatarUrl?: string }) {
    return this.authService.googleLogin(body);
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
    @Body() body: { notifications?: unknown; display?: unknown; leaderboardVisible?: boolean; timezone?: string },
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
    return this.authService.issueTokenForUser(user.id);
  }
}
