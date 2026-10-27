import { Module } from '@nestjs/common';
import { PlatformCoursesController } from './platform-courses.controller';
import { PlatformCoursesService } from './platform-courses.service';
import { WordPressModule } from '../wordpress/wordpress.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [WordPressModule, CertificatesModule, FilesModule],
  controllers: [PlatformCoursesController],
  providers: [PlatformCoursesService],
  exports: [PlatformCoursesService],
})
export class PlatformCoursesModule {}
