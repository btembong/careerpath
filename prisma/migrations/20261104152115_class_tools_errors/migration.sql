-- AlterTable
ALTER TABLE "MentorBooking" ADD COLUMN     "whiteboardSnapshot" TEXT;

-- CreateTable
CREATE TABLE "ClassPoll" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "option" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassQuestion" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "answer" TEXT,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ClassQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassQuestionVote" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ClassQuestionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassQuiz" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionIds" TEXT[],
    "secondsEach" INTEGER NOT NULL DEFAULT 60,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassGroup" (
    "id" TEXT NOT NULL,
    "liveClassId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomUrl" TEXT NOT NULL,
    "memberIds" TEXT[],
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorEvent" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "where" TEXT NOT NULL,
    "stack" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "userIds" TEXT[],
    "browsers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "ErrorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorHit" (
    "id" TEXT NOT NULL,
    "errorId" TEXT NOT NULL,
    "userId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorHit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClassPoll_liveClassId_idx" ON "ClassPoll"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPollVote_pollId_studentId_key" ON "ClassPollVote"("pollId", "studentId");

-- CreateIndex
CREATE INDEX "ClassQuestion_liveClassId_idx" ON "ClassQuestion"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassQuestionVote_questionId_userId_key" ON "ClassQuestionVote"("questionId", "userId");

-- CreateIndex
CREATE INDEX "ClassQuiz_liveClassId_idx" ON "ClassQuiz"("liveClassId");

-- CreateIndex
CREATE INDEX "ClassGroup_liveClassId_idx" ON "ClassGroup"("liveClassId");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorEvent_fingerprint_key" ON "ErrorEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorEvent_status_lastSeen_idx" ON "ErrorEvent"("status", "lastSeen");

-- CreateIndex
CREATE INDEX "ErrorHit_at_idx" ON "ErrorHit"("at");

-- AddForeignKey
ALTER TABLE "ClassPoll" ADD CONSTRAINT "ClassPoll_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassPollVote" ADD CONSTRAINT "ClassPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ClassPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassQuestion" ADD CONSTRAINT "ClassQuestion_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassQuestionVote" ADD CONSTRAINT "ClassQuestionVote_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ClassQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassQuiz" ADD CONSTRAINT "ClassQuiz_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_liveClassId_fkey" FOREIGN KEY ("liveClassId") REFERENCES "LiveClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorHit" ADD CONSTRAINT "ErrorHit_errorId_fkey" FOREIGN KEY ("errorId") REFERENCES "ErrorEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

