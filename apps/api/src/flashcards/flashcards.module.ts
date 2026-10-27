import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsController } from './flashcards.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({ imports: [PrismaModule], providers: [FlashcardsService], controllers: [FlashcardsController], exports: [FlashcardsService] })
export class FlashcardsModule {}
