import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';
import { WordPressModule } from '../wordpress/wordpress.module';

@Module({
  imports: [WordPressModule],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
