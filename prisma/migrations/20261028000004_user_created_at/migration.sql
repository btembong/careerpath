-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


-- Backfill: older accounts get the date of their first known activity instead of today
UPDATE "UserProfile" u SET "createdAt" = first_seen.at
FROM (
  SELECT id, LEAST(
    (SELECT MIN("enrolledAt")  FROM "CourseEnrollment" e WHERE e."studentId" = p.id),
    (SELECT MIN("purchasedAt") FROM "PackagePurchase"  pp WHERE pp."studentId" = p.id),
    (SELECT MIN("purchasedAt") FROM "CoursePurchase"   cp WHERE cp."studentId" = p.id),
    (SELECT MIN("createdAt")   FROM "XPEvent"          x WHERE x."userId" = p.id),
    (SELECT MIN("updatedAt")   FROM "LessonProgress"   lp WHERE lp."studentId" = p.id)
  ) AS at
  FROM "UserProfile" p
) first_seen
WHERE u.id = first_seen.id AND first_seen.at IS NOT NULL;
