-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ORG_ADMIN';

-- AlterTable
ALTER TABLE "CoursePurchase" ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrgEnrollment" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "organisationId" TEXT,
ADD COLUMN     "pricePerSeat" INTEGER;

-- AlterTable
ALTER TABLE "OrgSeat" ADD COLUMN     "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "joinedVia" TEXT NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "remindedAt" TIMESTAMP(3),
ALTER COLUMN "inviteEmail" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PackagePurchase" ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "organisationId" TEXT;

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" TEXT,
    "contactEmail" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "joinEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "packageId" TEXT,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "sessionId" TEXT,
    "tranzakSessionId" TEXT,
    "couponId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "packagePurchaseId" TEXT,
    "coursePurchaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "endedAccess" BOOLEAN NOT NULL DEFAULT false,
    "clawedBack" INTEGER NOT NULL DEFAULT 0,
    "byId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPost" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "upvoteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUpvote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StaffUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_joinCode_key" ON "Organisation"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_sessionId_key" ON "PaymentAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_studentId_idx" ON "PaymentAttempt"("studentId");

-- CreateIndex
CREATE INDEX "Refund_purchaseId_idx" ON "Refund"("purchaseId");

-- CreateIndex
CREATE INDEX "StaffPost_room_createdAt_idx" ON "StaffPost"("room", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUpvote_postId_userId_key" ON "StaffUpvote"("postId", "userId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgEnrollment" ADD CONSTRAINT "OrgEnrollment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPost" ADD CONSTRAINT "StaffPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPost" ADD CONSTRAINT "StaffPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StaffPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUpvote" ADD CONSTRAINT "StaffUpvote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "StaffPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: one organisation for each school that already bought seats, with a join code
INSERT INTO "Organisation" ("id", "name", "contactEmail", "joinCode", "createdAt")
SELECT gen_random_uuid()::text, e."organizationName", MIN(e."contactEmail"),
       UPPER(SUBSTRING(REGEXP_REPLACE(e."organizationName", '[^A-Za-z]', '', 'g') FROM 1 FOR 3)) || '-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4)),
       MIN(e."purchasedAt")
FROM "OrgEnrollment" e
GROUP BY e."organizationName";

UPDATE "OrgEnrollment" e SET "organisationId" = o."id" FROM "Organisation" o WHERE o."name" = e."organizationName" AND e."organisationId" IS NULL;
