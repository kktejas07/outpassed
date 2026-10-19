CREATE TYPE "ExtensionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ParcelStatus" AS ENUM ('AT_GATE', 'COLLECTED', 'RETURNED');
CREATE TYPE "SosKind" AS ENUM ('MEDICAL', 'SAFETY', 'OTHER');
CREATE TYPE "SosStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
CREATE TYPE "NoticeAudience" AS ENUM ('STUDENTS', 'PARENTS', 'EVERYONE');

CREATE TABLE "outpass_extensions" (
    "id" TEXT NOT NULL,
    "outpassId" TEXT NOT NULL,
    "previousReturnBy" TIMESTAMP(3) NOT NULL,
    "requestedReturnBy" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "outpass_extensions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outpass_extensions_outpassId_status_idx" ON "outpass_extensions"("outpassId", "status");
CREATE INDEX "outpass_extensions_status_idx" ON "outpass_extensions"("status");
ALTER TABLE "outpass_extensions" ADD CONSTRAINT "outpass_extensions_outpassId_fkey" FOREIGN KEY ("outpassId") REFERENCES "outpasses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outpass_extensions" ADD CONSTRAINT "outpass_extensions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "note" TEXT,
    "code" TEXT NOT NULL,
    "status" "ParcelStatus" NOT NULL DEFAULT 'AT_GATE',
    "loggedById" TEXT NOT NULL,
    "handedById" TEXT,
    "collectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "parcels_studentId_status_idx" ON "parcels"("studentId", "status");
CREATE INDEX "parcels_status_createdAt_idx" ON "parcels"("status", "createdAt");
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_handedById_fkey" FOREIGN KEY ("handedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sos_alerts" (
    "id" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "kind" "SosKind" NOT NULL,
    "note" TEXT,
    "status" "SosStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sos_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sos_alerts_status_createdAt_idx" ON "sos_alerts"("status", "createdAt");
CREATE INDEX "sos_alerts_raisedById_idx" ON "sos_alerts"("raisedById");
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "NoticeAudience" NOT NULL DEFAULT 'STUDENTS',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notices_createdAt_idx" ON "notices"("createdAt");
ALTER TABLE "notices" ADD CONSTRAINT "notices_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notice_reads" (
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("noticeId", "userId")
);
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
