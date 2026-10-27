import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  RawBodyRequest,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateCourseCheckoutDto } from './dto/create-course-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/create-checkout-session')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Create a checkout session. Gateway chosen by currency: Paystack (NGN/GHS/ZAR/KES/EGP), Tranzak (XAF/XOF), Stripe (USD/EUR/GBP). Coupon applied server-side.',
  })
  createCheckout(@CurrentUser() user: UserProfile, @Body() dto: CreateCheckoutDto) {
    return this.paymentsService.createCheckoutSession(user, dto);
  }

  @Post('payments/create-course-checkout/:courseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a checkout session for an individually priced course. Optional coupon applied server-side.' })
  createCourseCheckout(
    @CurrentUser() user: UserProfile,
    @Param('courseId') courseId: string,
    @Body() dto: CreateCourseCheckoutDto,
  ) {
    return this.paymentsService.createCourseCheckoutSession(user, courseId, dto.couponCode, dto.mobileWalletNumber);
  }

  @Post('payments/webhook/paystack')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') sig: string,
  ) {
    return this.paymentsService.handlePaystackWebhook(req.rawBody!, sig);
  }

  @Post('payments/webhook/tranzak')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  tranzakWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.paymentsService.handleTranzakWebhook(req.rawBody!);
  }

  @Post('payments/webhook/stripe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    return this.paymentsService.handleStripeWebhook(req.rawBody!, sig);
  }

  @Post('payments/enroll-free/:courseId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enroll in a free (price = 0) course without payment' })
  enrollFree(@CurrentUser() user: UserProfile, @Param('courseId') courseId: string) {
    return this.paymentsService.enrollFree(user, courseId);
  }

  @Get('payments/me/purchases')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Student: list all package and course purchases with invoice details' })
  getMyPurchases(@CurrentUser() user: UserProfile) {
    return this.paymentsService.getMyPurchases(user.id);
  }

  @Get('payments/verify-purchase')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Tranzak popup polling — check if a gateway session has been fulfilled. ' +
      'Called by the portal after the Tranzak popup window closes. ' +
      'Returns { completed: true } once the webhook has processed the payment.',
  })
  verifyPurchase(
    @CurrentUser() user: UserProfile,
    @Query('sessionId') sessionId: string,
  ) {
    return this.paymentsService.verifyPurchase(user.id, sessionId);
  }
}
