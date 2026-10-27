-- AlterTable: add teacher agreement fields to UserProfile
ALTER TABLE "UserProfile" ADD COLUMN "agreementAcceptedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "agreementVersion" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "agreementIp" TEXT;
