-- AlterTable
ALTER TABLE "PlatformCourse" ADD COLUMN     "catalogueHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "teacherPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wpAuthorEmail" TEXT,
ADD COLUMN     "wpCategoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "wpDescription" TEXT,
ADD COLUMN     "wpModifiedAt" TIMESTAMP(3),
ADD COLUMN     "wpPulledAt" TIMESTAMP(3),
ADD COLUMN     "wpStatus" TEXT,
ADD COLUMN     "wpTitle" TEXT;

-- CreateTable
CREATE TABLE "WpCategoryMap" (
    "wpTermId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "courseCount" INTEGER NOT NULL DEFAULT 0,
    "programmeId" TEXT,
    "subjectId" TEXT,
    "levelId" TEXT,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "setBy" TEXT NOT NULL DEFAULT 'AUTO',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WpCategoryMap_pkey" PRIMARY KEY ("wpTermId")
);

-- CreateTable
CREATE TABLE "WpPull" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT,
    "kind" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "hidden" INTEGER NOT NULL DEFAULT 0,
    "archived" INTEGER NOT NULL DEFAULT 0,
    "found" JSONB,

    CONSTRAINT "WpPull_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WpCategoryMap" ADD CONSTRAINT "WpCategoryMap_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WpCategoryMap" ADD CONSTRAINT "WpCategoryMap_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WpCategoryMap" ADD CONSTRAINT "WpCategoryMap_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "EducationLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WpPull" ADD CONSTRAINT "WpPull_byId_fkey" FOREIGN KEY ("byId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

