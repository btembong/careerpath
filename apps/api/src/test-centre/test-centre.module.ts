import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { QuestionAiService } from './question-ai.service';
import { MockExamService } from './mock-exam.service';
import { TestCentreService } from './test-centre.service';
import { QuestionBankService } from './question-bank.service';
import { TestCentreController, QuestionBankController, MockExamController } from './test-centre.controller';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [TestCentreService, QuestionBankService, QuestionAiService, MockExamService],
  controllers: [TestCentreController, QuestionBankController, MockExamController],
})
export class TestCentreModule {}
