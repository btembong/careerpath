-- AlterTable
ALTER TABLE "PayoutAccount" ADD COLUMN "pinSetAt" TIMESTAMP(3),
ADD COLUMN "autoMode" TEXT,
ADD COLUMN "autoThreshold" INTEGER,
ADD COLUMN "lockedByUser" BOOLEAN NOT NULL DEFAULT false;
