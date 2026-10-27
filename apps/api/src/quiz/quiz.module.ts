import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizController } from './quiz.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({ imports: [PrismaModule], providers: [QuizService], controllers: [QuizController], exports: [QuizService] })
export class QuizModule {}
