-- Sign-up consent to the Terms and Conditions and the Privacy Policy
ALTER TABLE "UserProfile" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "termsVersion" TEXT;
