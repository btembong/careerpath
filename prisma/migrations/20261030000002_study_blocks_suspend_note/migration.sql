-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "StudyBlock" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 60,
    "topic" TEXT NOT NULL,
    "courseId" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyBlock_studentId_startsAt_idx" ON "StudyBlock"("studentId", "startsAt");

-- AddForeignKey
ALTER TABLE "StudyBlock" ADD CONSTRAINT "StudyBlock_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

