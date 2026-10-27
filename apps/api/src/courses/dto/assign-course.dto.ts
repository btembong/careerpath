import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignCourseDto {
  @ApiPropertyOptional({ description: 'UserProfile ID of the teacher. Null = unassigned.' })
  @IsString()
  @IsOptional()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'Teacher commission % of sale. Null = teacher is paid outside the platform.',
    example: 40,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  teacherCommissionPct?: number;

  @ApiPropertyOptional({ description: 'UserProfile ID of the subject reviewer. Null = unassigned.' })
  @IsString()
  @IsOptional()
  reviewerId?: string;

  @ApiPropertyOptional({
    description: 'Reviewer commission % of sale. Null = reviewer is paid outside the platform.',
    example: 10,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  reviewerCommissionPct?: number;
}
