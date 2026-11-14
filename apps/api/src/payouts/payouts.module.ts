import { Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { TranzakGateway } from '../payments/gateways/tranzak.gateway';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MailModule, AuditModule, NotificationsModule],
  controllers: [PayoutsController, WithdrawalsController],
  providers: [PayoutsService, WithdrawalsService, TranzakGateway],
  exports: [WithdrawalsService],
})
export class PayoutsModule {}
