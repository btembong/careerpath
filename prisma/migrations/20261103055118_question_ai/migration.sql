-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "aiDraft" JSONB,
ADD COLUMN     "aiGenerated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TestAnswer" ADD COLUMN     "aiFeedback" TEXT,
ADD COLUMN     "markedBy" TEXT;

