-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'LIVE');

-- CreateEnum
CREATE TYPE "TestMode" AS ENUM ('PRACTICE', 'EXAM');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'STRUCTURED';

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "bankOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "moduleId" TEXT,
ADD COLUMN     "parts" JSONB,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "sourceLessonId" TEXT,
ADD COLUMN     "status" "QuestionStatus" NOT NULL DEFAULT 'LIVE';

-- CreateTable
CREATE TABLE "TestSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mode" "TestMode" NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "title" TEXT NOT NULL,
    "filters" JSONB,
    "questionIds" TEXT[],
    "timeLimitSecs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "maxScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" JSONB,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "timeSecs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionProgress" (
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "correctStreak" INTEGER NOT NULL DEFAULT 0,
    "lastCorrect" BOOLEAN,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionProgress_pkey" PRIMARY KEY ("studentId","questionId")
);

-- CreateIndex
CREATE INDEX "TestSession_studentId_startedAt_idx" ON "TestSession"("studentId", "startedAt");

-- CreateIndex
CREATE INDEX "TestAnswer_questionId_idx" ON "TestAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "TestAnswer_sessionId_questionId_key" ON "TestAnswer"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionBank_courseId_status_idx" ON "QuestionBank"("courseId", "status");

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestAnswer" ADD CONSTRAINT "TestAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionProgress" ADD CONSTRAINT "QuestionProgress_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

