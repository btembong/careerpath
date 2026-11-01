import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ROOMS = [
  { key: 'announcements', label: 'Announcements', adminOnly: true },
  { key: 'tips', label: 'Teaching tips', adminOnly: false },
  { key: 'exams', label: 'Exams and syllabus', adminOnly: false },
  { key: 'portal', label: 'Using the portal', adminOnly: false },
] as const;
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const author = { select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true, teachingSubjects: { select: { name: true }, take: 2 } } } as const;

/** The staff room: teachers, reviewers and CareerPath talking to each other, apart from students */
@Injectable()
export class StaffRoomService {
  constructor(private prisma: PrismaService) {}

  private who(a: { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; role: string; avatarUrl: string | null; teachingSubjects: { name: string }[] }) {
    return { id: a.id, name: a.role === 'ADMIN' ? 'CareerPath team' : nameOf(a), avatarUrl: a.avatarUrl, badge: a.role === 'ADMIN' ? 'CareerPath' : a.teachingSubjects.map(s => s.name).join(' · ') || (a.role === 'SUBJECT_REVIEWER' ? 'Reviewer' : null), isAdmin: a.role === 'ADMIN' };
  }

  async list(user: UserProfile, room?: string) {
    const r = ROOMS.find(x => x.key === room)?.key;
    const [posts, counts, latestNews] = await Promise.all([
      this.prisma.staffPost.findMany({
        where: { parentId: null, ...(r ? { room: r } : {}) },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }], take: 60,
        include: {
          author, upvotes: { where: { userId: user.id }, select: { id: true } },
          replies: { orderBy: { createdAt: 'asc' }, include: { author, upvotes: { where: { userId: user.id }, select: { id: true } } } },
        },
      }),
      this.prisma.staffPost.groupBy({ by: ['room'], where: { parentId: null }, _count: { _all: true } }),
      this.prisma.staffPost.findFirst({ where: { room: 'announcements', parentId: null }, orderBy: { createdAt: 'desc' }, select: { id: true, body: true, createdAt: true } }),
    ]);
    const roomLabel = (k: string) => ROOMS.find(x => x.key === k)?.label ?? k;
    return {
      rooms: [{ key: 'all', label: 'All', count: counts.reduce((n, c) => n + c._count._all, 0) }, ...ROOMS.map(x => ({ key: x.key, label: x.label, count: counts.find(c => c.room === x.key)?._count._all ?? 0, adminOnly: x.adminOnly }))],
      room: r ?? 'all',
      canPostAnnouncements: user.role === 'ADMIN',
      isAdmin: user.role === 'ADMIN',
      latestNews,
      posts: posts.map(p => ({
        id: p.id, room: p.room, roomLabel: roomLabel(p.room), body: p.body, createdAt: p.createdAt, isPinned: p.isPinned, upvotes: p.upvoteCount, myUpvote: p.upvotes.length > 0,
        author: this.who(p.author), mine: p.authorId === user.id,
        replies: p.replies.map(x => ({ id: x.id, body: x.body, createdAt: x.createdAt, upvotes: x.upvoteCount, myUpvote: x.upvotes.length > 0, author: this.who(x.author), mine: x.authorId === user.id })),
      })),
    };
  }

  async post(user: UserProfile, dto: { room?: string; body?: string; parentId?: string }) {
    const body = String(dto.body ?? '').trim();
    if (!body) throw new BadRequestException('Write something first');
    if (body.length > 4000) throw new BadRequestException('Keep it under 4,000 characters');
    if (dto.parentId) {
      const parent = await this.prisma.staffPost.findUnique({ where: { id: dto.parentId }, select: { id: true, room: true, parentId: true } });
      if (!parent || parent.parentId) throw new NotFoundException('Post not found');
      return this.prisma.staffPost.create({ data: { room: parent.room, authorId: user.id, parentId: parent.id, body } });
    }
    const room = ROOMS.find(x => x.key === dto.room);
    if (!room) throw new BadRequestException('Choose a room');
    if (room.adminOnly && user.role !== 'ADMIN') throw new ForbiddenException('Only CareerPath posts announcements');
    return this.prisma.staffPost.create({ data: { room: room.key, authorId: user.id, body } });
  }

  async upvote(user: UserProfile, id: string) {
    const post = await this.prisma.staffPost.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId === user.id) throw new BadRequestException('You can’t upvote your own post');
    const mine = await this.prisma.staffUpvote.findUnique({ where: { postId_userId: { postId: id, userId: user.id } } });
    if (mine) {
      await this.prisma.$transaction([this.prisma.staffUpvote.delete({ where: { id: mine.id } }), this.prisma.staffPost.update({ where: { id }, data: { upvoteCount: { decrement: 1 } } })]);
      return { myUpvote: false };
    }
    await this.prisma.$transaction([this.prisma.staffUpvote.create({ data: { postId: id, userId: user.id } }), this.prisma.staffPost.update({ where: { id }, data: { upvoteCount: { increment: 1 } } })]);
    return { myUpvote: true };
  }

  async pin(user: UserProfile, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only CareerPath can pin');
    const p = await this.prisma.staffPost.findUnique({ where: { id }, select: { isPinned: true, parentId: true } });
    if (!p || p.parentId) throw new NotFoundException('Post not found');
    return { isPinned: (await this.prisma.staffPost.update({ where: { id }, data: { isPinned: !p.isPinned } })).isPinned };
  }

  async remove(user: UserProfile, id: string) {
    const p = await this.prisma.staffPost.findUnique({ where: { id }, select: { authorId: true } });
    if (!p) throw new NotFoundException('Post not found');
    if (p.authorId !== user.id && user.role !== 'ADMIN') throw new ForbiddenException('You can only remove your own posts');
    await this.prisma.staffPost.delete({ where: { id } });
    return { removed: true };
  }
}
