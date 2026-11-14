-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('AWAITING_APPROVAL', 'SENDING', 'PAID', 'FAILED', 'REJECTED');

-- AlterTable
ALTER TABLE "PayoutAccount" ADD COLUMN "provider" TEXT,
ADD COLUMN "holderName" TEXT,
ADD COLUMN "nameCheck" TEXT,
ADD COLUMN "changedAt" TIMESTAMP(3),
ADD COLUMN "pinHash" TEXT,
ADD COLUMN "pinFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "fee" INTEGER,
    "currency" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL,
    "method" TEXT NOT NULL,
    "paidTo" TEXT NOT NULL,
    "payeeNumber" TEXT NOT NULL,
    "payeeName" TEXT,
    "reference" TEXT NOT NULL,
    "transferId" TEXT,
    "debitTxId" TEXT,
    "approvals" JSONB NOT NULL DEFAULT '[]',
    "approvalsNeeded" INTEGER NOT NULL DEFAULT 0,
    "flags" TEXT[],
    "failureReason" TEXT,
    "rejectedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_reference_key" ON "Withdrawal"("reference");
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");
CREATE INDEX "Withdrawal_userId_requestedAt_idx" ON "Withdrawal"("userId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
