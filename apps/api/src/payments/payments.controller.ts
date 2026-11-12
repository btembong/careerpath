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
  Res,
  Put,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateCourseCheckoutDto } from './dto/create-course-checkout.dto';
import { AddOnCheckoutDto } from './dto/add-on-checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService, private readonly billing: BillingService) {}

  @Get('payments/me/billing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Student: what I have access to (with time left), my payments and totals' })
  myBilling(@CurrentUser() user: UserProfile) {
    return this.billing.billing(user.id);
  }

  @Get('payments/me/receipts/:kind/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Student: a PDF receipt for one of my purchases (kind = package | course)' })
  async receipt(@CurrentUser() user: UserProfile, @Param('kind') kind: string, @Param('id') id: string, @Res() res: Response) {
    const { pdf, filename } = await this.billing.receipt(user.id, kind, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' });
    res.send(Buffer.from(pdf));
  }

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
    return this.paymentsService.createCourseCheckoutSession(user, courseId, dto.couponCode, dto.mobileWalletNumber, dto.addOns);
  }

  @Get('payments/add-ons/:kind/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Extras a course or package offers at checkout (live classes, mentorship), with prices' })
  addOns(@CurrentUser() user: UserProfile, @Param('kind') kind: string, @Param('id') id: string) {
    return this.paymentsService.offeredAddOns(kind, id, user.id);
  }

  @Post('payments/create-addon-checkout/:kind/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add live classes or mentorship to a course or package the student already has (priced by the server)' })
  createAddOnCheckout(@CurrentUser() user: UserProfile, @Param('kind') kind: string, @Param('id') id: string, @Body() dto: AddOnCheckoutDto) {
    return this.paymentsService.createAddOnCheckout(user, kind, id, dto);
  }

  @Put('payments/admin/add-ons/:kind/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Offer or stop offering add-ons on a course or package. live: { cohortId, price } | null; mentorship: { perMonth, price } | null (prices in normal units)' })
  setAddOns(@Param('kind') kind: string, @Param('id') id: string, @Body() dto: { live?: { cohortId?: string; price?: number } | null; mentorship?: { perMonth?: number; price?: number } | null }) {
    return this.paymentsService.setAddOns(kind, id, dto);
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
