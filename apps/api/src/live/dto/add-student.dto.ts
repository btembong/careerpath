import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddStudentDto {
  @ApiProperty({ description: 'UserProfile ID of the student to enroll' })
  @IsUUID()
  studentId: string;
}
