import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({ imports: [PrismaModule, CertificatesModule], providers: [AlertsService], controllers: [AlertsController], exports: [AlertsService] })
export class AlertsModule {}
