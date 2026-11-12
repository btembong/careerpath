-- Pay for teaching a live class: settled once, with the minutes and amount paid
ALTER TABLE "LiveClass" ADD COLUMN "teacherPay" TEXT;
ALTER TABLE "LiveClass" ADD COLUMN "teacherPaidMins" INTEGER;
ALTER TABLE "LiveClass" ADD COLUMN "teacherPaidAmount" INTEGER;
