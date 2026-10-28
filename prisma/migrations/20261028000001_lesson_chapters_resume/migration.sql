-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "chapters" JSONB,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "LessonProgress" ADD COLUMN     "positionSecs" INTEGER NOT NULL DEFAULT 0;

