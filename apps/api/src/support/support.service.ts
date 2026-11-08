import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

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
        // What support needs to answer without looking elsewhere: who, where, and what they paid for
        student: {
          select: {
            id: true, email: true, name: true, firstName: true, lastName: true, phone: true, country: { select: { name: true } },
            purchases: { select: { id: true, purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, invoiceNo: true, package: { select: { name: true } } }, orderBy: { purchasedAt: 'desc' }, take: 5 },
            coursePurchases: { select: { id: true, purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, invoiceNo: true, course: { select: { title: true } } }, orderBy: { purchasedAt: 'desc' }, take: 5 },
          },
        },
      },
    });
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const reply = dto.adminNote?.trim() || null;
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: dto.status, ...(dto.adminNote !== undefined ? { adminNote: reply } : {}) },
    });
    // Tell the student when there's a new answer
    if (reply && reply !== ticket.adminNote) {
      this.notifications.notify(ticket.studentId, { type: 'system', title: 'Support replied', body: `${ticket.subject}: ${reply.slice(0, 140)}`, href: '/student/support' }, {
        subject: `Re: ${ticket.subject}`, badge: 'Support', title: 'Support answered your question',
        text: `We replied to "${ticket.subject}".`, quote: reply, quoteLabel: 'Our reply',
        cta: 'Open my support tickets', footnote: 'If this doesn’t solve it, reply on the support page and we’ll pick it up.',
      });
    }
    return updated;
  }
}
