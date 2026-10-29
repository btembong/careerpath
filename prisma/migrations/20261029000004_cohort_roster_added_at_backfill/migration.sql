-- Existing cohort members got "today" as their join date; use when they bought the linked package,
-- else when the cohort started, else its first class.
UPDATE "CohortRoster" r SET "addedAt" = COALESCE(
  (SELECT MIN(pp."purchasedAt") FROM "PackagePurchase" pp JOIN "Package" p ON p."id" = pp."packageId"
     WHERE pp."studentId" = r."studentId" AND p."cohortId" = r."cohortId"),
  (SELECT c."startDate" FROM "Cohort" c WHERE c."id" = r."cohortId"),
  (SELECT MIN(l."scheduledAt") FROM "LiveClass" l WHERE l."cohortId" = r."cohortId"),
  r."addedAt"
)
WHERE r."addedAt" >= '2026-10-29';
