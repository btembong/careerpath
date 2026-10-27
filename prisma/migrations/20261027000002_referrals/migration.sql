-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_referralCode_key" ON "UserProfile"("referralCode");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

