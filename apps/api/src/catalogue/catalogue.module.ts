import { Module } from '@nestjs/common';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { PublicPagesService } from './public-pages.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [CatalogueController],
  providers: [CatalogueService, PublicPagesService],
  exports: [CatalogueService, PublicPagesService],
})
export class CatalogueModule {}
