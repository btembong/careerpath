import { IsNumber, Min, Max, IsOptional, IsInt, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCountryDto {
  @ApiPropertyOptional({ example: 5.5 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  repCommissionPercent?: number;

  @ApiPropertyOptional({ example: 200 })
  @IsInt()
  @Min(0)
  @IsOptional()
  perStudentBonus?: number;

  @ApiPropertyOptional({ description: 'UserProfile ID of the country rep to assign' })
  @IsUUID()
  @IsOptional()
  repId?: string;
}
