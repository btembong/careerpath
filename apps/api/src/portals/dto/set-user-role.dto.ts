import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@cpa/shared';

export class SetUserRoleDto {
  @ApiProperty({ enum: UserRole, example: UserRole.SUBJECT_REVIEWER })
  @IsEnum(UserRole)
  role: UserRole;

  /**
   * Required when promoting to SUBJECT_REVIEWER — sets their wallet currency.
   * E.g. "USD", "NGN", "GHS". Ignored for other roles.
   */
  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @Length(2, 5)
  @IsOptional()
  payoutCurrency?: string;
}
