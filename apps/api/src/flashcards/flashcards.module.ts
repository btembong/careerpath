import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsController } from './flashcards.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({ imports: [PrismaModule, GamificationModule], providers: [FlashcardsService], controllers: [FlashcardsController], exports: [FlashcardsService] })
export class FlashcardsModule {}
