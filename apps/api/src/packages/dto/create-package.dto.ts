import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePackageDto {
  @ApiProperty({ example: 'WAEC Science Bundle' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Everything you need to ace WAEC Sciences.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 5000, description: 'Price in minor currency units (e.g. kobo, pesewas)' })
  @IsInt()
  @Min(0)
  priceAmount: number;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  currency: string;

  @ApiPropertyOptional({ example: ['wp-course-101', 'wp-course-102'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  courseIds?: string[];

  @ApiPropertyOptional({ example: ['secondary-school', 'waec'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryTags?: string[];

  @ApiPropertyOptional({ example: 365, description: 'Days until access expires; null = lifetime' })
  @IsInt()
  @Min(1)
  @IsOptional()
  validityDays?: number;

  @ApiPropertyOptional({ example: 'Monthly 1-to-1 session', description: 'Mentorship included; shown to students only when set' })
  @IsString()
  @IsOptional()
  mentorship?: string | null;

  @ApiPropertyOptional({ description: 'Questions and answers for the package page: [{ q, a }]; empty = the standard questions' })
  @IsArray()
  @IsOptional()
  faq?: { q: string; a: string }[] | null;

  @ApiPropertyOptional({ example: 2, description: 'Mentorship sessions per month; null = no limit' })
  @IsInt()
  @Min(1)
  @IsOptional()
  mentorshipSessionsPerMonth?: number | null;

  @ApiPropertyOptional({ description: 'Cohort ID to auto-enroll students into on purchase' })
  @IsString()
  @IsOptional()
  cohortId?: string;
}
