import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { OnboardingVideoController, OnboardingVideoPublicController } from './onboarding-video.controller';
import { OnboardingVideoService } from './onboarding-video.service';

@Module({
  imports: [FilesModule],
  controllers: [OnboardingVideoController, OnboardingVideoPublicController],
  providers: [OnboardingVideoService],
  exports: [OnboardingVideoService],
})
export class OnboardingVideoModule {}
