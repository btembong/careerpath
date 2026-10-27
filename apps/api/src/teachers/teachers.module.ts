import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { WordPressModule } from '../wordpress/wordpress.module';

@Module({
  imports: [WordPressModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
