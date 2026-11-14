-- Sign-in codes from an authenticator app
ALTER TABLE "UserProfile" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);

CREATE TABLE "UserAuthenticator" (
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastStep" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAuthenticator_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserAuthenticator" ADD CONSTRAINT "UserAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
