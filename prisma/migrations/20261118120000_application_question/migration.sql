-- An admin can ask an applicant a question before deciding; the application then waits for them
ALTER TABLE "TeacherApplication" ADD COLUMN "question" TEXT;
ALTER TABLE "TeacherApplication" ADD COLUMN "questionAskedAt" TIMESTAMP(3);
