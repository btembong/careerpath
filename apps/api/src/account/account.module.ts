import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({
  imports: [MailModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
