import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreatePackageDto } from './create-package.dto';
import { PartialType } from '@nestjs/mapped-types';

export class UpdatePackageDto extends PartialType(CreatePackageDto) {
  @ApiPropertyOptional({ description: 'Publish or unpublish. Publish is blocked if any course is unreviewed.' })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
