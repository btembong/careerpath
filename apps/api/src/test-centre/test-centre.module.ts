import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { QuestionAiService } from './question-ai.service';
import { TestCentreService } from './test-centre.service';
import { QuestionBankService } from './question-bank.service';
import { TestCentreController, QuestionBankController } from './test-centre.controller';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [TestCentreService, QuestionBankService, QuestionAiService],
  controllers: [TestCentreController, QuestionBankController],
})
export class TestCentreModule {}
