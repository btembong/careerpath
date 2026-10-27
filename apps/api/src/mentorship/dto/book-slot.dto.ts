import { IsUUID, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BookSlotDto {
  @ApiProperty({ description: 'MentorSlot ID to book' })
  @IsUUID()
  slotId: string;

  @ApiPropertyOptional({ description: 'Optional note to the mentor' })
  @IsString()
  @IsOptional()
  notes?: string;
}
