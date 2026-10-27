import { IsString, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitStoryDto {
  @ApiProperty({ description: 'The success story text' })
  @IsString()
  @MinLength(100)
  story: string;

  @ApiProperty({ description: 'Student consent to publish their name alongside the story' })
  @IsBoolean()
  consentToPublish: boolean;
}
