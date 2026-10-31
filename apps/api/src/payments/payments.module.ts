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

@Module({
  imports: [WordPressModule, CouponsModule, MailModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, BillingService, PaystackGateway, TranzakGateway, StripeGateway],
})
export class PaymentsModule {}
