-- Replace the placeholder Record entity with the campus gate domain.

-- DropTable
DROP TABLE "records";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'PARENT', 'WARDEN', 'GUARD', 'ADMIN');
CREATE TYPE "OutpassType" AS ENUM ('LOCAL', 'HOME', 'MEDICAL', 'EMERGENCY');
CREATE TYPE "OutpassStatus" AS ENUM ('PENDING_PARENT', 'PENDING_WARDEN', 'APPROVED', 'REJECTED', 'CANCELLED', 'OUT', 'RETURNED');
CREATE TYPE "ApprovalStep" AS ENUM ('PARENT', 'WARDEN');
CREATE TYPE "Decision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "GateDirection" AS ENUM ('EXIT', 'ENTRY');
CREATE TYPE "GateMethod" AS ENUM ('QR', 'MANUAL');
CREATE TYPE "VisitStatus" AS ENUM ('PENDING_HOST', 'APPROVED', 'REJECTED', 'CHECKED_IN', 'CHECKED_OUT');
CREATE TYPE "VisitorType" AS ENUM ('GUEST', 'PARENT', 'RECRUITER', 'VENDOR', 'EVENT', 'ALUMNI', 'DELIVERY');

-- AlterTable: existing users get an empty name, then the default is removed.
ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
ADD COLUMN "phone" TEXT,
ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STUDENT';
ALTER TABLE "users" ALTER COLUMN "name" DROP DEFAULT;

-- CreateTable
CREATE TABLE "student_profiles" (
    "userId" TEXT NOT NULL,
    "rollNo" TEXT,
    "hostel" TEXT,
    "room" TEXT,
    "dateOfBirth" DATE,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "guardianships" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'Parent',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guardianships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outpasses" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "OutpassType" NOT NULL,
    "destination" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "leaveAt" TIMESTAMP(3) NOT NULL,
    "returnBy" TIMESTAMP(3) NOT NULL,
    "status" "OutpassStatus" NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outpasses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "outpassId" TEXT NOT NULL,
    "step" "ApprovalStep" NOT NULL,
    "decision" "Decision" NOT NULL,
    "approverId" TEXT NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "visitorPhone" TEXT NOT NULL,
    "visitorType" "VisitorType" NOT NULL DEFAULT 'GUEST',
    "purpose" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL,
    "walkIn" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "hostId" TEXT NOT NULL,
    "registeredById" TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_events" (
    "id" TEXT NOT NULL,
    "direction" "GateDirection" NOT NULL,
    "gate" TEXT NOT NULL,
    "method" "GateMethod" NOT NULL DEFAULT 'QR',
    "accepted" BOOLEAN NOT NULL,
    "personName" TEXT NOT NULL,
    "note" TEXT,
    "outpassId" TEXT,
    "visitId" TEXT,
    "guardId" TEXT NOT NULL,
    "deviceTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE UNIQUE INDEX "student_profiles_rollNo_key" ON "student_profiles"("rollNo");
CREATE INDEX "guardianships_parentId_idx" ON "guardianships"("parentId");
CREATE UNIQUE INDEX "guardianships_studentId_parentId_key" ON "guardianships"("studentId", "parentId");
CREATE INDEX "outpasses_studentId_status_idx" ON "outpasses"("studentId", "status");
CREATE INDEX "outpasses_status_returnBy_idx" ON "outpasses"("status", "returnBy");
CREATE INDEX "approvals_outpassId_idx" ON "approvals"("outpassId");
CREATE INDEX "visits_hostId_status_idx" ON "visits"("hostId", "status");
CREATE INDEX "visits_status_idx" ON "visits"("status");
CREATE INDEX "gate_events_createdAt_idx" ON "gate_events"("createdAt");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outpasses" ADD CONSTRAINT "outpasses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_outpassId_fkey" FOREIGN KEY ("outpassId") REFERENCES "outpasses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_outpassId_fkey" FOREIGN KEY ("outpassId") REFERENCES "outpasses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
