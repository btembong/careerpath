-- AlterTable
ALTER TABLE "PlatformCourse" ADD COLUMN     "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[];

