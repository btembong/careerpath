import { IsString, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'Package ID to purchase' })
  @IsString()
  packageId: string;

  @ApiPropertyOptional({ description: 'Optional coupon code — applied server-side only' })
  @IsString()
  @IsOptional()
  couponCode?: string;

  @ApiPropertyOptional({
    description:
      'Tranzak only — mobile wallet number for direct USSD push (MTN MoMo / Orange Money). ' +
      'Include country prefix, e.g. "237680657567" for Cameroon. ' +
      'When supplied, no redirect URL is returned; user approves on their phone.',
    example: '237680657567',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{9,15}$/, { message: 'mobileWalletNumber must be 9–15 digits including country code' })
  mobileWalletNumber?: string;
}
