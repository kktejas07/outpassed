-- Fees: the office can let a fee be paid in parts; each accepted payment
-- gets a receipt number.
ALTER TABLE "fees" ADD COLUMN "allowParts" BOOLEAN NOT NULL DEFAULT false;
CREATE SEQUENCE "fee_receipt_seq" START 1001;
ALTER TABLE "fee_payments" ADD COLUMN "receiptNo" INTEGER;
CREATE UNIQUE INDEX "fee_payments_receiptNo_key" ON "fee_payments"("receiptNo");

-- Hostel helpdesk.
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "studentId" TEXT NOT NULL,
    "hostelId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "location" TEXT,
    "photo" BYTEA,
    "photoMime" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tickets_number_key" ON "tickets"("number");
CREATE INDEX "tickets_hostelId_status_idx" ON "tickets"("hostelId", "status");
CREATE INDEX "tickets_studentId_idx" ON "tickets"("studentId");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "hostels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticket_updates" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_updates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_updates_ticketId_idx" ON "ticket_updates"("ticketId");
ALTER TABLE "ticket_updates" ADD CONSTRAINT "ticket_updates_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_updates" ADD CONSTRAINT "ticket_updates_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Offer taps per day, for the monthly sponsor report (totals only).
CREATE TABLE "offer_daily_stats" (
    "offerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "taps" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "offer_daily_stats_pkey" PRIMARY KEY ("offerId", "day")
);
ALTER TABLE "offer_daily_stats" ADD CONSTRAINT "offer_daily_stats_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Photos can live in an S3-compatible bucket instead of the database.
ALTER TABLE "user_photos" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "user_photos" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "gate_photos" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "gate_photos" ADD COLUMN "storageKey" TEXT;
ALTER TABLE "visits" ADD COLUMN "visitorPhotoKey" TEXT;
ALTER TABLE "fee_payments" ADD COLUMN "proofKey" TEXT;
ALTER TABLE "market_items" ADD COLUMN "photoKey" TEXT;
ALTER TABLE "tickets" ADD COLUMN "photoKey" TEXT;
