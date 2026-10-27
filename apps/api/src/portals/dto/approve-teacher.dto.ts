import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveTeacherDto {
  @ApiProperty({ enum: ['approve', 'reject'] })
  @IsEnum(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @ApiPropertyOptional({ example: 'Insufficient teaching experience for this platform.' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  rejectionReason?: string;
}
