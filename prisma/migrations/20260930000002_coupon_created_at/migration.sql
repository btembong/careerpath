-- Add createdAt to Coupon (backfill existing rows with current timestamp)
ALTER TABLE "Coupon" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
