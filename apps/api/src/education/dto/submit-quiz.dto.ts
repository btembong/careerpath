import { IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QuizAnswerDto {
  @ApiProperty({ description: 'QuestionBank ID' })
  @IsString()
  questionId: string;

  @ApiProperty({ description: 'Student answer — the chosen option key for MCQ, or free text for written' })
  @IsString()
  answer: string;
}

export class SubmitQuizDto {
  @ApiProperty({ description: 'WordPress course ID this quiz belongs to' })
  @IsString()
  courseId: string;

  @ApiProperty({ type: [QuizAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuizAnswerDto)
  answers: QuizAnswerDto[];
}
