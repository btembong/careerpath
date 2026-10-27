import { IsString, IsEmail, IsUUID, IsInt, IsArray, ArrayMinSize, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrgEnrollmentDto {
  @ApiProperty({ example: 'Accenture Nigeria' })
  @IsString()
  organizationName: string;

  @ApiProperty({ example: 'hr@accenture.ng' })
  @IsEmail()
  contactEmail: string;

  @ApiProperty({ description: 'Package ID being purchased in bulk' })
  @IsUUID()
  packageId: string;

  @ApiProperty({
    description: 'Emails to invite — one seat per email. Must match seatsPurchased.',
    example: ['alice@accenture.ng', 'bob@accenture.ng'],
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  inviteEmails: string[];
}
