import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'WordPress username or email' })
  @IsString()
  login: string;

  @ApiProperty({ description: 'Reset key from the password-reset email' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
