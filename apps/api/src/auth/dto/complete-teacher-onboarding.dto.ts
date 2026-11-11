import {
  IsString,
  MinLength,
  IsArray,
  IsOptional,
  IsInt,
  Min,
  IsUrl,
  IsUUID,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Qualification, RegisterTeacherDto, TeachingModality } from './register-teacher.dto';

/** Fields shared by portal teacher sign-up and WP-tutor onboarding. */
// The sign-up consent belongs to signing up only, not to WordPress teachers finishing their profile
export type TeacherProfileInput = Omit<RegisterTeacherDto, 'email' | 'password' | 'termsAccepted' | 'termsVersion'>;

/** Same profile as the sign-up wizard, minus credentials (WP tutors already have an account). */
export class CompleteTeacherOnboardingDto implements TeacherProfileInput {
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;

  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;

  @ApiProperty({ description: 'Required — drives country attribution' })
  @IsUUID()
  countryId: string;

  @ApiPropertyOptional({ isArray: true }) @IsArray() @IsString({ each: true }) @IsOptional()
  subjectAreas?: string[];

  @ApiPropertyOptional({ isArray: true }) @IsArray() @IsUUID('4', { each: true }) @IsOptional()
  teachingSubjectIds?: string[];

  @ApiPropertyOptional({ isArray: true }) @IsArray() @IsUUID('4', { each: true }) @IsOptional()
  teachingProgrammeIds?: string[];

  @ApiPropertyOptional() @IsInt() @Min(0) @IsOptional() yearsExperience?: number;
  @ApiPropertyOptional({ enum: Qualification }) @IsEnum(Qualification) @IsOptional() qualification?: Qualification;
  @ApiPropertyOptional({ enum: TeachingModality }) @IsEnum(TeachingModality) @IsOptional() teachingModality?: TeachingModality;

  @ApiProperty({ minLength: 100 }) @IsString() @MinLength(100) bio: string;

  @ApiPropertyOptional() @IsUrl() @IsOptional() documentUrl?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() linkedinUrl?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() websiteUrl?: string;

  @ApiProperty({ description: 'Must be true' }) @IsBoolean() agreementAccepted: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() agreementVersion?: string;
}
