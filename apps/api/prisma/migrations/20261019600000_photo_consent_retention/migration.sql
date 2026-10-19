-- How long gate and visitor photos are kept before they are deleted.
ALTER TABLE "institution" ADD COLUMN "photoRetentionDays" INTEGER NOT NULL DEFAULT 90;

-- A guardian's agreement to store photos of a student under 18 (or any
-- student on a school campus). Withdrawing deletes the row and the photos.
CREATE TABLE "photo_consents" (
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "photo_consents_pkey" PRIMARY KEY ("studentId")
);
ALTER TABLE "photo_consents" ADD CONSTRAINT "photo_consents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_consents" ADD CONSTRAINT "photo_consents_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The purge looks photos up by age.
CREATE INDEX "gate_photos_createdAt_idx" ON "gate_photos"("createdAt");
