import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimSeatDto {
  @ApiProperty({ description: 'The invite email the seat was created for' })
  @IsEmail()
  inviteEmail: string;

  @ApiProperty({ description: 'Password to set for the new account (if registering)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Amara' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Osei' })
  @IsString()
  lastName: string;
}
