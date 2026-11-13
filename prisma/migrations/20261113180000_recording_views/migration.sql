-- CreateTable
CREATE TABLE "RecordingView" (
    "liveClassId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingView_pkey" PRIMARY KEY ("liveClassId","userId")
);

-- CreateIndex
CREATE INDEX "RecordingView_userId_idx" ON "RecordingView"("userId");

-- AddForeignKey
ALTER TABLE "RecordingView" ADD CONSTRAINT "RecordingView_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingView" ADD CONSTRAINT "RecordingView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
