import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsString() @IsNotEmpty()
  category: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  subject: string;

  @IsString() @IsNotEmpty() @MaxLength(2000)
  message: string;
}
