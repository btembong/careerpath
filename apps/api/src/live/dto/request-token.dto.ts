import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestTokenDto {
  @ApiProperty({ description: 'LiveClass ID to join' })
  @IsUUID()
  liveClassId: string;
}
