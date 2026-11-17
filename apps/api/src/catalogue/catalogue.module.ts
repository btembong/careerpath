import { Module } from '@nestjs/common';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { PublicPagesService } from './public-pages.service';

@Module({
  controllers: [CatalogueController],
  providers: [CatalogueService, PublicPagesService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
