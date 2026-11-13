ALTER TABLE "UserProfile" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "lastDevice" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "signupSource" TEXT;

CREATE TABLE "ActiveDay" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "device" TEXT,
    CONSTRAINT "ActiveDay_pkey" PRIMARY KEY ("userId","day")
);
CREATE INDEX "ActiveDay_day_idx" ON "ActiveDay"("day");
ALTER TABLE "ActiveDay" ADD CONSTRAINT "ActiveDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounts that already exist: referrals are known; the rest started on the website or the portal
UPDATE "UserProfile" SET "signupSource" = 'referral' WHERE "referredById" IS NOT NULL;
-- Learning that already happened counts as activity on those days
INSERT INTO "ActiveDay" ("userId", "day")
  SELECT DISTINCT "studentId", ("updatedAt" AT TIME ZONE 'UTC')::date FROM "LessonProgress"
  WHERE "updatedAt" > now() - interval '400 days'
  ON CONFLICT DO NOTHING;
