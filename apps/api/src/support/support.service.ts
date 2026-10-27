import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  // ── Student ────────────────────────────────────────────────

  async createTicket(student: UserProfile, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        studentId: student.id,
        category: dto.category,
        subject: dto.subject,
        message: dto.message,
      },
    });
  }

  async getMyTickets(studentId: string) {
    return this.prisma.supportTicket.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin ──────────────────────────────────────────────────

  async getAllTickets(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status, adminNote: dto.adminNote },
    });
  }
}
