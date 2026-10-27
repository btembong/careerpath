import { IsString, IsNumber, Min, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertExchangeRateDto {
  @ApiProperty({ example: 'NGN' })
  @IsString()
  @Length(3, 4)
  currency: string;

  @ApiProperty({
    example: 0.00065,
    description: '1 unit of this currency expressed in USD (e.g. 1 NGN = 0.00065 USD)',
  })
  @IsNumber()
  @Min(0.000001)
  toUsdRate: number;
}
