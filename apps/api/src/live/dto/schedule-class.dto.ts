import { IsString, IsDateString, IsInt, Min, Max, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduleClassDto {
  @ApiProperty({ example: 'Week 3 — Trigonometry' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'We will cover sine, cosine and the unit circle.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '2026-10-15T09:00:00.000Z', description: 'ISO 8601 datetime for the class' })
  @IsDateString()
  scheduledAt: string;

  @ApiPropertyOptional({ example: 90, description: 'Duration in minutes (default: 90)' })
  @IsInt()
  @Min(15)
  @Max(360)
  @IsOptional()
  durationMinutes?: number;
}
