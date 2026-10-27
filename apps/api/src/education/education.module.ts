import { Module } from '@nestjs/common';
import { EducationController } from './education.controller';
import { EducationService } from './education.service';
import { CertificatesModule } from '../certificates/certificates.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [CertificatesModule, MailModule],
  controllers: [EducationController],
  providers: [EducationService],
})
export class EducationModule {}
