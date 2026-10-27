import { IsString, Length, IsNumber, Min, Max, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCountryDto {
  @ApiProperty({ example: 'NG', description: 'ISO 3166-1 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  code: string;

  @ApiProperty({ example: 'Nigeria' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'NGN', description: 'ISO 4217 currency code' })
  @IsString()
  @Length(3, 4)
  currency: string;

  @ApiPropertyOptional({ example: 5.5, description: 'Rep commission as % of in-country revenue' })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  repCommissionPercent?: number;

  @ApiPropertyOptional({ example: 200, description: 'Flat bonus per active student in minor currency units' })
  @IsInt()
  @Min(0)
  @IsOptional()
  perStudentBonus?: number;
}
