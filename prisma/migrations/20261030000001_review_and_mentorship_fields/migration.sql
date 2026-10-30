-- AlterTable
ALTER TABLE "CourseAssignment" ADD COLUMN     "reviewChecklist" JSONB,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "mentorshipSessionsPerMonth" INTEGER;

