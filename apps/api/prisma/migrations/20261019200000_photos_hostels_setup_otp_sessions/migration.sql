-- Phone sign-in lookups
ALTER TABLE "users" ADD COLUMN "phoneNormalized" TEXT;
UPDATE "users" SET "phoneNormalized" = CASE
  WHEN length(regexp_replace("phone", '\D', '', 'g')) = 10 THEN '+91' || regexp_replace("phone", '\D', '', 'g')
  WHEN length(regexp_replace("phone", '\D', '', 'g')) >= 11 THEN '+' || regexp_replace("phone", '\D', '', 'g')
  ELSE NULL END
WHERE "phone" IS NOT NULL;
CREATE INDEX "users_phoneNormalized_idx" ON "users"("phoneNormalized");

-- Institution (single row)
CREATE TABLE "institution" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "institution_pkey" PRIMARY KEY ("id")
);

-- Hostels, created from the free-text names already on student profiles
CREATE TABLE "hostels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hostels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "hostels_name_key" ON "hostels"("name");
INSERT INTO "hostels" ("id", "name")
SELECT gen_random_uuid()::text, h FROM (SELECT DISTINCT trim("hostel") AS h FROM "student_profiles" WHERE "hostel" IS NOT NULL AND trim("hostel") <> '') x;

ALTER TABLE "student_profiles" ADD COLUMN "hostelId" TEXT;
UPDATE "student_profiles" sp SET "hostelId" = h."id" FROM "hostels" h WHERE trim(sp."hostel") = h."name";
CREATE INDEX "student_profiles_hostelId_idx" ON "student_profiles"("hostelId");
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notices" ADD COLUMN "hostelId" TEXT;
ALTER TABLE "notices" ADD CONSTRAINT "notices_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "warden_hostels" (
    "userId" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    CONSTRAINT "warden_hostels_pkey" PRIMARY KEY ("userId", "hostelId")
);
CREATE INDEX "warden_hostels_hostelId_idx" ON "warden_hostels"("hostelId");
ALTER TABLE "warden_hostels" ADD CONSTRAINT "warden_hostels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warden_hostels" ADD CONSTRAINT "warden_hostels_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Photos
CREATE TABLE "user_photos" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_photos_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SMS codes
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "otp_codes_phone_createdAt_idx" ON "otp_codes"("phone", "createdAt");

-- Refresh tokens
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
