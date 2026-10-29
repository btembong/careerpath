-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "mentorship" TEXT;

-- AlterTable
ALTER TABLE "PlatformCourse" ADD COLUMN     "accessMonths" INTEGER DEFAULT 12,
ADD COLUMN     "language" TEXT;

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

