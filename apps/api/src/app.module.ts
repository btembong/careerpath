import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CountriesModule } from './countries/countries.module';
import { CoursesModule } from './courses/courses.module';
import { PackagesModule } from './packages/packages.module';
import { PortalsModule } from './portals/portals.module';
import { PaymentsModule } from './payments/payments.module';
import { LiveModule } from './live/live.module';
import { EducationModule } from './education/education.module';
import { CertificatesModule } from './certificates/certificates.module';
import { MentorshipModule } from './mentorship/mentorship.module';
import { CouponsModule } from './coupons/coupons.module';
import { OrgModule } from './org/org.module';
import { WalletsModule } from './wallets/wallets.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReportsModule } from './reports/reports.module';
import { CommunityModule } from './community/community.module';
import { SupportModule } from './support/support.module';
import { FilesModule } from './files/files.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { MailModule } from './mail/mail.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { PlatformCoursesModule } from './platform-courses/platform-courses.module';
import { PayoutAccountsModule } from './payout-accounts/payout-accounts.module';
import { AuditModule } from './audit/audit.module';
import { TeachersModule } from './teachers/teachers.module';
import { SearchModule } from './search/search.module';
import { MessagesModule } from './messages/messages.module';
import { QuizModule } from './quiz/quiz.module';
import { GamificationModule } from './gamification/gamification.module';
import { FlashcardsModule } from './flashcards/flashcards.module';
import { NotesModule } from './notes/notes.module';
import { RubricsModule } from './rubrics/rubrics.module';
import { GradingModule } from './grading/grading.module';
import { AlertsModule } from './alerts/alerts.module';
import { AiModule } from './ai/ai.module';
import { OnboardingVideoModule } from './onboarding-video/onboarding-video.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReferralsModule } from './referrals/referrals.module';
import { RedisModule } from './redis/redis.module';

@Module({
  providers: [
    // Apply throttler globally — all routes subject to rate limiting unless @SkipThrottle() is added
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    // In-memory cache — shared globally across all modules
    CacheModule.register({ isGlobal: true, ttl: 300_000 /* 5 min ms */ }),
    // Cron job runner
    ScheduleModule.forRoot(),
    // Rate limiting — default: 60 requests per 60 seconds per IP
    // Auth endpoints override this to be stricter (see auth.controller.ts)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    FilesModule,
    CountriesModule,
    CoursesModule,
    PackagesModule,
    PortalsModule,
    PaymentsModule,
    LiveModule,
    EducationModule,
    CertificatesModule,
    MentorshipModule,
    CouponsModule,
    OrgModule,
    WalletsModule,
    PayoutsModule,
    ReportsModule,
    CommunityModule,
    SupportModule,
    SchedulerModule,
    MailModule,
    CatalogueModule,
    PlatformCoursesModule,
    PayoutAccountsModule,
    AuditModule,
    TeachersModule,
    SearchModule,
    MessagesModule,
    QuizModule,
    GamificationModule,
    FlashcardsModule,
    NotesModule,
    RubricsModule,
    GradingModule,
    AlertsModule,
    AiModule,
    OnboardingVideoModule,
    NotificationsModule,
    ReferralsModule,
  ],
})
export class AppModule {}
