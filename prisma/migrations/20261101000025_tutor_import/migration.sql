-- AlterTable
ALTER TABLE "CourseModule" ADD COLUMN     "wpTopicId" INTEGER;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "wpItemId" INTEGER;

-- AlterTable
ALTER TABLE "PlatformCourse" ADD COLUMN     "contentImportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "wpQuestionId" INTEGER;

-- CreateTable
CREATE TABLE "TutorImport" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "wpCourseId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "step" TEXT,
    "byId" TEXT,
    "summary" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TutorImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorImport_courseId_createdAt_idx" ON "TutorImport"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "TutorImport_status_idx" ON "TutorImport"("status");

