-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "MessageThread" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "isGroup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "membersCanAdd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "onlyAdminsEdit" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onlyAdminsSend" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "pinnedMessageId" TEXT;

-- CreateTable
CREATE TABLE "ThreadMember" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ThreadMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadMember_userId_idx" ON "ThreadMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ThreadMember_threadId_userId_key" ON "ThreadMember"("threadId", "userId");

-- AddForeignKey
ALTER TABLE "ThreadMember" ADD CONSTRAINT "ThreadMember_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadMember" ADD CONSTRAINT "ThreadMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

