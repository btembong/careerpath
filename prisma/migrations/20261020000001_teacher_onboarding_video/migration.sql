-- CreateTable
CREATE TABLE "OnboardingVideo" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'TEACHER',
    "title" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "captionsUrl" TEXT,
    "durationSec" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingVideoView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "maxWatchedSec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSec" DOUBLE PRECISION,
    "lastReportAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OnboardingVideoView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingVideo_audience_key" ON "OnboardingVideo"("audience");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingVideoView_userId_videoId_version_key" ON "OnboardingVideoView"("userId", "videoId", "version");

-- AddForeignKey
ALTER TABLE "OnboardingVideoView" ADD CONSTRAINT "OnboardingVideoView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingVideoView" ADD CONSTRAINT "OnboardingVideoView_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "OnboardingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

