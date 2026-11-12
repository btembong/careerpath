-- An add-on bought after the course or package gets its own invoice number
ALTER TABLE "PaymentAttempt" ADD COLUMN "invoiceNo" TEXT;
