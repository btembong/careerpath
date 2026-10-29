-- AlterTable
ALTER TABLE "PlatformCourse" ADD COLUMN     "priceProposedAt" TIMESTAMP(3),
ADD COLUMN     "proposedPriceAmount" INTEGER,
ADD COLUMN     "proposedPriceCurrency" TEXT;

-- CreateTable
CREATE TABLE "CoursePriceDefault" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT,
    "currency" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePriceDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePriceDefault_programmeId_currency_key" ON "CoursePriceDefault"("programmeId", "currency");

-- AddForeignKey
ALTER TABLE "CoursePriceDefault" ADD CONSTRAINT "CoursePriceDefault_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

