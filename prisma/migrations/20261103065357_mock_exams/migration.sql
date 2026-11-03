-- CreateEnum
CREATE TYPE "ExamKind" AS ENUM ('MOCK', 'PAST_PAPER');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "mockExamId" TEXT;

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL,
    "kind" "ExamKind" NOT NULL DEFAULT 'MOCK',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "programmeId" TEXT,
    "courseIds" TEXT[],
    "packageIds" TEXT[],
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "timeLimitSecs" INTEGER NOT NULL,
    "passMark" INTEGER NOT NULL DEFAULT 50,
    "attemptsAllowed" INTEGER NOT NULL DEFAULT 0,
    "showAnswers" BOOLEAN NOT NULL DEFAULT true,
    "randomised" BOOLEAN NOT NULL DEFAULT true,
    "sections" JSONB,
    "questionIds" TEXT[],
    "examBody" TEXT,
    "year" INTEGER,
    "session" TEXT,
    "paperNumber" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockExam_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MockExam_status_kind_idx" ON "MockExam"("status", "kind");

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_mockExamId_fkey" FOREIGN KEY ("mockExamId") REFERENCES "MockExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

