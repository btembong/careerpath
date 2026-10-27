import { IsString, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitAssignmentDto {
  @ApiPropertyOptional({ description: 'URL of the uploaded file (from POST /files/upload)' })
  @IsUrl()
  @IsOptional()
  fileUrl?: string;
}
