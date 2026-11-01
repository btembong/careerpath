import { BillingService } from './billing.service';
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackGateway } from './gateways/paystack.gateway';
import { TranzakGateway } from './gateways/tranzak.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { WordPressModule } from '../wordpress/wordpress.module';
import { CouponsModule } from '../coupons/coupons.module';
import { MailModule } from '../mail/mail.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentOpsService } from './payment-ops.service';
import { PaymentOpsController } from './payment-ops.controller';

@Module({
  imports: [WordPressModule, CouponsModule, MailModule, AuditModule],
  controllers: [PaymentsController, PaymentOpsController],
  providers: [PaymentsService, BillingService, PaymentOpsService, PaystackGateway, TranzakGateway, StripeGateway],
})
export class PaymentsModule {}
