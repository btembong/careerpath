-- Payout accounts outside Cameroon: account type and branch (or SWIFT) code; withdrawals keep the full details for paying by hand
ALTER TABLE "PayoutAccount" ADD COLUMN "accountType" TEXT;
ALTER TABLE "PayoutAccount" ADD COLUMN "branchCode" TEXT;
ALTER TABLE "Withdrawal" ADD COLUMN "payeeDetails" JSONB;
