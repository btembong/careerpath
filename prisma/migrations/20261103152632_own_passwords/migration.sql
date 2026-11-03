-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordUpdatedAt" TIMESTAMP(3);

