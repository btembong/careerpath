-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionDueAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3);

