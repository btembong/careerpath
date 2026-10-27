import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { OnboardingVideoController } from './onboarding-video.controller';
import { OnboardingVideoService } from './onboarding-video.service';

@Module({
  imports: [FilesModule],
  controllers: [OnboardingVideoController],
  providers: [OnboardingVideoService],
  exports: [OnboardingVideoService],
})
export class OnboardingVideoModule {}
