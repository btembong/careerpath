import { IsString, IsIn, IsOptional } from 'class-validator';

export class UpdateTicketDto {
  @IsString() @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status: string;

  @IsOptional() @IsString()
  adminNote?: string;
}
