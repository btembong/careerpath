import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCohortDto {
  @ApiProperty({ example: 'WAEC Maths — Morning Group' })
  @IsString()
  @MinLength(3)
  name: string;
}
