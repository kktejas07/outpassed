-- Regular (recurring) visitor passes
ALTER TABLE "visits" ADD COLUMN "repeatDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "visits" ADD COLUMN "dailyFrom" TEXT;
ALTER TABLE "visits" ADD COLUMN "dailyTo" TEXT;

-- Audit log
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Night roll call
CREATE TYPE "RollStatus" AS ENUM ('PRESENT', 'ABSENT', 'ON_PASS');

CREATE TABLE "roll_calls" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "takenById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    CONSTRAINT "roll_calls_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roll_calls_hostelId_date_key" ON "roll_calls"("hostelId", "date");
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "roll_call_entries" (
    "rollCallId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "RollStatus" NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roll_call_entries_pkey" PRIMARY KEY ("rollCallId", "studentId")
);
CREATE INDEX "roll_call_entries_studentId_idx" ON "roll_call_entries"("studentId");
ALTER TABLE "roll_call_entries" ADD CONSTRAINT "roll_call_entries_rollCallId_fkey" FOREIGN KEY ("rollCallId") REFERENCES "roll_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roll_call_entries" ADD CONSTRAINT "roll_call_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
