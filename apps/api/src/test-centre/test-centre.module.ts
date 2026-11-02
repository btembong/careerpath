import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TestCentreService } from './test-centre.service';
import { QuestionBankService } from './question-bank.service';
import { TestCentreController, QuestionBankController } from './test-centre.controller';

@Module({
  imports: [PrismaModule],
  providers: [TestCentreService, QuestionBankService],
  controllers: [TestCentreController, QuestionBankController],
})
export class TestCentreModule {}
