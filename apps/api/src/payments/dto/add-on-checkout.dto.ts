import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddOnCheckoutDto {
  @ApiProperty({ description: 'What to add: live and/or mentorship', example: ['live'] })
  @IsArray()
  @IsIn(['live', 'mentorship'], { each: true })
  addOns: string[];

  @ApiPropertyOptional({ description: 'Tranzak only: mobile wallet number for a payment prompt, with the country code', example: '237680657567' })
  @IsString()
  @IsOptional()
  @Matches(/^\d{9,15}$/, { message: 'mobileWalletNumber must be 9–15 digits including country code' })
  mobileWalletNumber?: string;
}
