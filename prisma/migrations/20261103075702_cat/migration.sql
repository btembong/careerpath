-- AlterEnum
ALTER TYPE "ExamKind" ADD VALUE 'CAT';

-- AlterEnum
ALTER TYPE "TestMode" ADD VALUE 'CAT';

-- AlterTable
ALTER TABLE "MockExam" ADD COLUMN     "catMax" INTEGER,
ADD COLUMN     "catMin" INTEGER,
ADD COLUMN     "catStandard" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "irtB" DOUBLE PRECISION,
ADD COLUMN     "irtN" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN     "cat" JSONB;

