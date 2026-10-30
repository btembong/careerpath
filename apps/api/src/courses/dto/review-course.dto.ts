import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class ReviewCourseDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required when rejecting; explains what needs to change.' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: "Checklist: { accuracy: good | fix, syllabus, media, quizzes, preview }" })
  @IsObject()
  @IsOptional()
  checklist?: Record<string, 'good' | 'fix'>;
}
