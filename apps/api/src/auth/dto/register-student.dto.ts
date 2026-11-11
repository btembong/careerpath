import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsPhoneNumber, IsUUID, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterStudentDto {
  @ApiProperty({ example: 'Amara' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Osei' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'amara@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+233241234567' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  /**
   * Country is required — it drives country-level revenue attribution
   * and the country rep's commission. Never inferred from phone/IP.
   */
  @ApiProperty({ example: 'uuid-of-ghana-country-record' })
  @IsUUID()
  countryId: string;

  @ApiPropertyOptional({ example: 'university' })
  @IsString()
  @IsOptional()
  programTrack?: string;

  @ApiPropertyOptional({ example: 'CPA-7K2Q9M', description: 'Code from a referral link; unknown codes are ignored' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  referralCode?: string;

  @ApiProperty({ example: true, description: 'Agreed to the Terms and Conditions and the Privacy Policy' })
  @IsBoolean()
  termsAccepted: boolean;

  @ApiPropertyOptional({ example: 'draft-2026-11', description: 'Which version of the Terms and Privacy Policy was shown' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  termsVersion?: string;
}
