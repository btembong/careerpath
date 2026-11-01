import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MentorshipService } from './mentorship.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookSlotDto } from './dto/book-slot.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('mentorship')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mentorship')
export class MentorshipController {
  constructor(private readonly mentorshipService: MentorshipService) {}

  // ── Teacher ──────────────────────────────────────────────

  @Post('mentors/slots')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Add an availability slot' })
  createSlot(@CurrentUser() user: UserProfile, @Body() dto: CreateSlotDto) {
    return this.mentorshipService.createSlot(user, dto);
  }

  @Get('allowance')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Mentorship sessions left this month' })
  allowance(@CurrentUser() user: UserProfile) {
    return this.mentorshipService.getAllowance(user.id);
  }

  @Get('mentors/slots/mine')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] List own upcoming slots with booking status' })
  getMySlots(@CurrentUser() user: UserProfile) {
    return this.mentorshipService.getMySlots(user.id);
  }

  @Delete('mentors/slots/:slotId')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Delete an unbooked slot' })
  deleteSlot(@CurrentUser() user: UserProfile, @Param('slotId') slotId: string) {
    return this.mentorshipService.deleteSlot(user, slotId);
  }

  @Get('teacher/bookings')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] All bookings for my slots' })
  getTeacherBookings(@CurrentUser() user: UserProfile) {
    return this.mentorshipService.getTeacherBookings(user.id);
  }

  // ── Student ──────────────────────────────────────────────

  @Get('mentors')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] All teachers with open availability slots' })
  getAvailableMentors() {
    return this.mentorshipService.getAvailableMentors();
  }

  @Get('mentors/:teacherId/slots')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: "[Student] Browse a teacher's open availability slots" })
  getTeacherSlots(@Param('teacherId') teacherId: string) {
    return this.mentorshipService.getTeacherSlots(teacherId);
  }

  @Post('bookings')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Book an open mentorship slot' })
  bookSlot(@CurrentUser() user: UserProfile, @Body() dto: BookSlotDto) {
    return this.mentorshipService.bookSlot(user, dto);
  }

  @Get('bookings/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] List own mentorship bookings' })
  getMyBookings(@CurrentUser() user: UserProfile) {
    return this.mentorshipService.getMyBookings(user.id);
  }

  @Post('bookings/:bookingId/review')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Submit a post-session review' })
  submitReview(
    @CurrentUser() user: UserProfile,
    @Param('bookingId') bookingId: string,
    @Body() dto: ReviewBookingDto,
  ) {
    return this.mentorshipService.submitReview(user, bookingId, dto);
  }

  // ── Shared (student + teacher) ───────────────────────────

  @Get('bookings/:bookingId/token')
  @Roles(UserRole.STUDENT, UserRole.TEACHER)
  @ApiOperation({ summary: 'Get a Daily.co token for a booked mentorship session' })
  getSessionToken(@CurrentUser() user: UserProfile, @Param('bookingId') bookingId: string) {
    return this.mentorshipService.getSessionToken(user, bookingId);
  }

  @Patch('bookings/:bookingId/cancel')
  @Roles(UserRole.STUDENT, UserRole.TEACHER)
  @ApiOperation({ summary: 'Cancel a booking (student or teacher)' })
  cancelBooking(
    @CurrentUser() user: UserProfile,
    @Param('bookingId') bookingId: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.mentorshipService.cancelBooking(user, bookingId, dto);
  }

  // ── Admin ─────────────────────────────────────────────────

  @Patch('admin/bookings/:bookingId/cancel')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Cancel a booking; the student and teacher are told' })
  adminCancel(@CurrentUser() user: UserProfile, @Param('bookingId') bookingId: string, @Body() dto: CancelBookingDto) {
    return this.mentorshipService.cancelBooking(user, bookingId, dto);
  }

  @Get('admin/bookings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] All mentorship bookings' })
  getAdminBookings() {
    return this.mentorshipService.getAdminBookings();
  }
}
