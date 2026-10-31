-- Courses owned by an admin account have no real teacher yet (the old WordPress sync made the clicking admin the owner)
UPDATE "PlatformCourse" SET "teacherPending" = true
WHERE "teacherId" IN (SELECT "id" FROM "UserProfile" WHERE "role" = 'ADMIN');
