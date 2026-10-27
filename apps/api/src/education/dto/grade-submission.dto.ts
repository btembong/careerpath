import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GradeSubmissionDto {
  @ApiProperty({ description: 'Points awarded' })
  @IsInt()
  @Min(0)
  grade: number;

  @ApiPropertyOptional({ description: 'Written feedback for the student' })
  @IsString()
  @IsOptional()
  feedback?: string;
}
