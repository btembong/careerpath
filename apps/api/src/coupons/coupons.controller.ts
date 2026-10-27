import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';

@ApiTags('coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('admin/coupons')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a coupon (percent or fixed off, optionally scoped to one package)' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Get('admin/coupons')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all coupons' })
  list() {
    return this.couponsService.list();
  }

  @Get('coupons/validate')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Validate a coupon code before checkout. Pass packageId OR courseId.' })
  @ApiQuery({ name: 'code',      required: true  })
  @ApiQuery({ name: 'packageId', required: false })
  @ApiQuery({ name: 'courseId',  required: false })
  validate(
    @Query('code')      code:      string,
    @Query('packageId') packageId: string | undefined,
    @Query('courseId')  courseId:  string | undefined,
  ) {
    return this.couponsService.validateForClient(code, packageId, courseId);
  }
}
