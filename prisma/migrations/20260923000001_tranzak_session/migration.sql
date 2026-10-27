-- CreateTable: TranzakSession
-- Stores purchase metadata keyed by mchTransactionRef before the Tranzak API call.
-- Tranzak has no customData/metadata field, so we use this table as a side-channel.

CREATE TABLE "TranzakSession" (
    "id"        TEXT NOT NULL,
    "requestId" TEXT,
    "studentId" TEXT NOT NULL,
    "packageId" TEXT,
    "courseId"  TEXT,
    "couponId"  TEXT,
    "amount"    INTEGER NOT NULL,
    "currency"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranzakSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TranzakSession_requestId_key" ON "TranzakSession"("requestId");
CREATE INDEX "TranzakSession_studentId_idx" ON "TranzakSession"("studentId");
