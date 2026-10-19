-- Hostellers live on campus; day scholars come in for the day.
CREATE TYPE "Residence" AS ENUM ('HOSTELLER', 'DAY_SCHOLAR');
ALTER TABLE "student_profiles" ADD COLUMN "residence" "Residence" NOT NULL DEFAULT 'HOSTELLER';
-- Students with no hostel on record are day scholars.
UPDATE "student_profiles" SET "residence" = 'DAY_SCHOLAR' WHERE "hostelId" IS NULL;
CREATE INDEX "student_profiles_residence_idx" ON "student_profiles"("residence");
