import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GamificationService } from './gamification.service';
import { GamificationController } from './gamification.controller';

/** Global so learning, assessment, certificate and payment flows can award XP without import churn. */
@Global()
@Module({ imports: [PrismaModule], providers: [GamificationService], controllers: [GamificationController], exports: [GamificationService] })
export class GamificationModule {}
