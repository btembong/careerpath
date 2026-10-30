-- AlterTable
ALTER TABLE "QuizAttempt" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "gradedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "displayPrefs" JSONB,
ADD COLUMN     "leaderboardVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notificationPrefs" JSONB;

