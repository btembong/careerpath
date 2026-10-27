import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { ApplicationFilesController } from './application-files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController, ApplicationFilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
