-- AlterTable
ALTER TABLE "CohortRoster" ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "faq" JSONB;


-- Backfill how existing cohort students joined
UPDATE "CohortRoster" r SET "source" = 'PACKAGE'
WHERE EXISTS (
  SELECT 1 FROM "PackagePurchase" pp JOIN "Package" p ON p."id" = pp."packageId"
  WHERE pp."studentId" = r."studentId" AND p."cohortId" = r."cohortId" AND pp."gateway" IS NOT NULL
);
UPDATE "CohortRoster" r SET "source" = 'ORG'
WHERE r."source" = 'ADMIN' AND EXISTS (
  SELECT 1 FROM "OrgSeat" s JOIN "OrgEnrollment" e ON e."id" = s."orgEnrollmentId" JOIN "Package" p ON p."id" = e."packageId"
  WHERE s."studentId" = r."studentId" AND p."cohortId" = r."cohortId"
);
