import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SessionsService } from './sessions.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { MailModule } from '../mail/mail.module';
import { PlatformCoursesModule } from '../platform-courses/platform-courses.module';
import { OnboardingVideoModule } from '../onboarding-video/onboarding-video.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { CourseAdminModule } from '../course-admin/course-admin.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
    }),
    WordPressModule,
    MailModule,
    PlatformCoursesModule,
    OnboardingVideoModule,
    ReferralsModule,
    CourseAdminModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionsService],
  exports: [JwtModule, PassportModule, JwtStrategy, SessionsService],
})
export class AuthModule {}
