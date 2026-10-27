import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportProgressDto {
  @ApiProperty() @IsUUID() videoId: string;
  @ApiProperty({ description: 'Current playback position in seconds' }) @IsNumber() @Min(0) positionSec: number;
  @ApiProperty({ description: 'Video duration reported by the player' }) @IsNumber() @Min(1) @Max(4 * 3600) durationSec: number;
}

export class UpsertOnboardingVideoDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(120) title: string;
  @ApiProperty({ description: 'Direct video file URL (uploaded to R2)' }) @IsString() videoUrl: string;
  @ApiPropertyOptional({ description: 'WebVTT captions URL' }) @IsString() @IsOptional() captionsUrl?: string | null;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(4 * 3600) @IsOptional() durationSec?: number;
  @ApiProperty() @IsBoolean() isActive: boolean;
  @ApiPropertyOptional({ description: 'Bump the version so every teacher must watch again' })
  @IsBoolean() @IsOptional() requireRewatch?: boolean;
}
