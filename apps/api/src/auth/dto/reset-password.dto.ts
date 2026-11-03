import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Our own reset link carries a token; links WordPress sent before the switch carry login + key. */
export class ResetPasswordDto {
  @ApiProperty({ required: false, description: 'Token from our reset email' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiProperty({ required: false, description: 'Older WordPress links: username or email' })
  @IsOptional()
  @IsString()
  login?: string;

  @ApiProperty({ required: false, description: 'Older WordPress links: reset key' })
  @IsOptional()
  @IsString()
  key?: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
