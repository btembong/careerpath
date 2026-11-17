-- Admin → Activity log
ALTER TABLE "AuditLog" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "area" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "summary" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "targetLabel" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "device" TEXT;

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
