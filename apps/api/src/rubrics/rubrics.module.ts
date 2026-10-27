import { Module } from '@nestjs/common';
import { RubricsService } from './rubrics.service';
import { RubricsController } from './rubrics.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({ imports: [PrismaModule], providers: [RubricsService], controllers: [RubricsController], exports: [RubricsService] })
export class RubricsModule {}
