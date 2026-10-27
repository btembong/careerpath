import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  // ── Student ────────────────────────────────────────────────

  @Post('tickets')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Submit a support ticket' })
  create(@CurrentUser() user: UserProfile, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user, dto);
  }

  @Get('tickets/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] My own support tickets' })
  mine(@CurrentUser() user: UserProfile) {
    return this.supportService.getMyTickets(user.id);
  }

  // ── Admin ──────────────────────────────────────────────────

  @Get('admin/tickets')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] All tickets, optionally filtered by status' })
  all(@Query('status') status?: string) {
    return this.supportService.getAllTickets(status);
  }

  @Patch('admin/tickets/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Update ticket status / add admin note' })
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto);
  }
}
