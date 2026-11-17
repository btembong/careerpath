-- City and country from the IP address, for the activity log and signed-in devices
ALTER TABLE "AuditLog" ADD COLUMN "city" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "country" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "city" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "country" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "countryCode" TEXT;
CREATE INDEX "UserSession_countryCode_idx" ON "UserSession"("countryCode");
