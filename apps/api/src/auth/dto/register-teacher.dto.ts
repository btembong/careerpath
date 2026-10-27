import {
  IsEmail,
  IsString,
  MinLength,
  IsArray,
  ArrayMinSize,
  IsOptional,
  IsInt,
  Min,
  IsUrl,
  IsUUID,
  IsEnum,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TeachingModality {
  ONLINE    = 'ONLINE',
  IN_PERSON = 'IN_PERSON',
  HYBRID    = 'HYBRID',
}

export enum Qualification {
  HIGH_SCHOOL   = 'HIGH_SCHOOL',
  BACHELOR      = 'BACHELOR',
  MASTER        = 'MASTER',
  PHD           = 'PHD',
  PROFESSIONAL  = 'PROFESSIONAL',
}

/**
 * Single payload for the full teacher application wizard.
 * The multi-step UI is frontend-only UX — NestJS receives one complete payload.
 */
export class RegisterTeacherDto {
  @ApiProperty({ example: 'Kwame' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Mensah' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'kwame@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: '+234 800 000 0000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: ['Mathematics', 'Physics'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  subjectAreas?: string[];

  @ApiPropertyOptional({ description: 'Subject IDs from the platform taxonomy', isArray: true })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  teachingSubjectIds?: string[];

  @ApiPropertyOptional({ description: 'Programme IDs from the platform taxonomy', isArray: true })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  teachingProgrammeIds?: string[];

  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(0)
  @IsOptional()
  yearsExperience?: number;

  @ApiPropertyOptional({ enum: Qualification })
  @IsEnum(Qualification)
  @IsOptional()
  qualification?: Qualification;

  @ApiPropertyOptional({ enum: TeachingModality })
  @IsEnum(TeachingModality)
  @IsOptional()
  teachingModality?: TeachingModality;

  @ApiProperty({ example: 'Experienced mathematics tutor with a passion for STEM education across Africa.', minLength: 100 })
  @IsString()
  @MinLength(100)
  bio: string;

  @ApiPropertyOptional({ example: 'https://pub-xxx.r2.dev/docs/cv.pdf' })
  @IsUrl()
  @IsOptional()
  documentUrl?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/kwame-mensah' })
  @IsUrl()
  @IsOptional()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 'https://kwame.dev' })
  @IsUrl()
  @IsOptional()
  websiteUrl?: string;

  @ApiPropertyOptional({ example: 'uuid-of-country' })
  @IsUUID()
  @IsOptional()
  countryId?: string;

  @ApiPropertyOptional({ example: true, description: 'Teacher accepted the Tutor Offer Letter & Content Ownership Agreement' })
  @IsBoolean()
  @IsOptional()
  agreementAccepted?: boolean;

  @ApiPropertyOptional({ example: 'v1.0' })
  @IsString()
  @IsOptional()
  agreementVersion?: string;
}
