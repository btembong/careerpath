import { IsString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCourseCheckoutDto {
  @ApiPropertyOptional({ description: 'Optional coupon code — applied server-side only' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({
    description:
      'Tranzak only — mobile wallet number for direct USSD push. ' +
      'Include country prefix, e.g. "237680657567" for Cameroon.',
    example: '237680657567',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{9,15}$/, { message: 'mobileWalletNumber must be 9–15 digits including country code' })
  mobileWalletNumber?: string;
}
