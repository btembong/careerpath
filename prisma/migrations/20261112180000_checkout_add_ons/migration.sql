-- Add-ons at checkout: what a course or package offers, and what each purchase included
ALTER TABLE "PlatformCourse" ADD COLUMN "addOns" JSONB;
ALTER TABLE "Package" ADD COLUMN "addOns" JSONB;
ALTER TABLE "PackagePurchase" ADD COLUMN "addOns" JSONB;
ALTER TABLE "CoursePurchase" ADD COLUMN "addOns" JSONB;
ALTER TABLE "PaymentAttempt" ADD COLUMN "addOns" JSONB;
