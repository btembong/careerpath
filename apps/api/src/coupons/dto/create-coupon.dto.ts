import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCouponDto {
  @ApiProperty({ example: 'LAUNCH50' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: 20, description: 'Percentage off (1–100). Use either this or amountOff.' })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  percentOff?: number;

  @ApiPropertyOptional({ description: 'Fixed discount in minor currency units. Use either this or percentOff.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  amountOff?: number;

  @ApiPropertyOptional({ description: 'Package ID to scope coupon to. Null = valid on any package.' })
  @IsString()
  @IsOptional()
  packageId?: string;

  @ApiPropertyOptional({ example: 100, description: 'Max number of redemptions. Null = unlimited.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxRedemptions?: number;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
