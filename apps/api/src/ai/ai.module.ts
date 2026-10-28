import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformCoursesModule } from '../platform-courses/platform-courses.module';

@Module({ imports: [PrismaModule, PlatformCoursesModule], providers: [AiService], controllers: [AiController], exports: [AiService] })
export class AiModule {}
