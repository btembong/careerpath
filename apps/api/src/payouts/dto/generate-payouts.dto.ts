import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GeneratePayoutsDto {
  @ApiProperty({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Start of the payout period (inclusive)',
  })
  @IsDateString()
  periodStart: string;

  @ApiProperty({
    example: '2026-09-30T23:59:59.000Z',
    description: 'End of the payout period (inclusive)',
  })
  @IsDateString()
  periodEnd: string;
}
