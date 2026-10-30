import { IsDateString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSlotDto {
  @ApiProperty({ example: '2026-10-20T10:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  durationMins?: number;

  @ApiPropertyOptional({ example: 6, description: 'Repeat the same time every week for this many weeks (1 = just once)' })
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  repeatWeeks?: number;
}
