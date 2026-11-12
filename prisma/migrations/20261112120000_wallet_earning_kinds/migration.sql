-- New ways money reaches a wallet: manual credits, mentorship sessions, live classes taught, cohort shares
ALTER TYPE "WalletTxSource" ADD VALUE IF NOT EXISTS 'MANUAL_CREDIT';
ALTER TYPE "WalletTxSource" ADD VALUE IF NOT EXISTS 'MENTOR_SESSION';
ALTER TYPE "WalletTxSource" ADD VALUE IF NOT EXISTS 'LIVE_CLASS';
ALTER TYPE "WalletTxSource" ADD VALUE IF NOT EXISTS 'COHORT_SHARE';

-- Who added a manual credit
ALTER TABLE "WalletTransaction" ADD COLUMN "createdById" TEXT;
