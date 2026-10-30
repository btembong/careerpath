import { Module } from '@nestjs/common';
import { RubricsService } from './rubrics.service';
import { RubricsController } from './rubrics.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EducationModule } from '../education/education.module';

@Module({ imports: [PrismaModule, EducationModule], providers: [RubricsService], controllers: [RubricsController], exports: [RubricsService] })
export class RubricsModule {}
