import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { FilesModule } from '../files/files.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [FilesModule, MailModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
