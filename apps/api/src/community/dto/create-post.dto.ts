import { IsString, IsOptional, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ description: 'Post body text' })
  @IsString()
  @MinLength(2)
  body: string;

  @ApiPropertyOptional({ description: 'Parent post ID for replies. Omit for top-level posts.' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
