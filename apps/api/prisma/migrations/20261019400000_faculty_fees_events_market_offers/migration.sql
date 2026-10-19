-- New enum values
ALTER TYPE "Role" ADD VALUE 'FACULTY';
ALTER TYPE "OutpassType" ADD VALUE 'ACADEMIC';
ALTER TYPE "OutpassType" ADD VALUE 'PERSONAL';
ALTER TYPE "OutpassStatus" ADD VALUE 'PENDING_FACULTY' BEFORE 'PENDING_PARENT';
ALTER TYPE "ApprovalStep" ADD VALUE 'FACULTY' BEFORE 'PARENT';

CREATE TYPE "FeeCategory" AS ENUM ('HOSTEL', 'MESS', 'BUS', 'TUITION', 'EXAM', 'FINE', 'OTHER');
CREATE TYPE "FeeStatus" AS ENUM ('DUE', 'SUBMITTED', 'PAID', 'WAIVED');
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'PROOF', 'OFFICE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "MarketStatus" AS ENUM ('PENDING', 'ACTIVE', 'SOLD', 'REJECTED', 'REMOVED');

-- Departments and faculty
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "hodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");
ALTER TABLE "departments" ADD CONSTRAINT "departments_hodId_fkey" FOREIGN KEY ("hodId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_profiles" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outpasses" ADD COLUMN "facultyId" TEXT;
ALTER TABLE "outpasses" ADD CONSTRAINT "outpasses_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Visitors: optional roll / ID number
ALTER TABLE "visits" ADD COLUMN "visitorIdNumber" TEXT;
ALTER TABLE "visits" ADD COLUMN "visitorPhoto" BYTEA;
ALTER TABLE "visits" ADD COLUMN "visitorPhotoMime" TEXT;

-- College settings
ALTER TABLE "institution" ADD COLUMN "offersEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "institution" ADD COLUMN "schoolMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "institution" ADD COLUMN "requireGatePhoto" BOOLEAN NOT NULL DEFAULT true;

-- Gate photos
CREATE TABLE "gate_photos" (
    "gateEventId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gate_photos_pkey" PRIMARY KEY ("gateEventId")
);
ALTER TABLE "gate_photos" ADD CONSTRAINT "gate_photos_gateEventId_fkey" FOREIGN KEY ("gateEventId") REFERENCES "gate_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fees
CREATE TABLE "fees" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'DUE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "remindStage" INTEGER NOT NULL DEFAULT 0,
    "lastRemindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fees_studentId_status_idx" ON "fees"("studentId", "status");
CREATE INDEX "fees_status_dueDate_idx" ON "fees"("status", "dueDate");
ALTER TABLE "fees" ADD CONSTRAINT "fees_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fees" ADD CONSTRAINT "fees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "fee_payments" (
    "id" TEXT NOT NULL,
    "feeId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "proof" BYTEA,
    "proofMime" TEXT,
    "gatewayOrderId" TEXT,
    "gatewayPaymentId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fee_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fee_payments_gatewayOrderId_key" ON "fee_payments"("gatewayOrderId");
CREATE INDEX "fee_payments_feeId_idx" ON "fee_payments"("feeId");
CREATE INDEX "fee_payments_status_idx" ON "fee_payments"("status");
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "fees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Events
CREATE TABLE "campus_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campus_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "campus_events_status_startsAt_idx" ON "campus_events"("status", "startsAt");
ALTER TABLE "campus_events" ADD CONSTRAINT "campus_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campus_events" ADD CONSTRAINT "campus_events_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "event_registrations" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "event_registrations_userId_idx" ON "event_registrations"("userId");
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "campus_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Marketplace
CREATE TABLE "market_items" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'Used',
    "status" "MarketStatus" NOT NULL DEFAULT 'PENDING',
    "photo" BYTEA,
    "photoMime" TEXT,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "market_items_status_createdAt_idx" ON "market_items"("status", "createdAt");
ALTER TABLE "market_items" ADD CONSTRAINT "market_items_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "market_interests" (
    "itemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "market_interests_pkey" PRIMARY KEY ("itemId", "buyerId")
);
ALTER TABLE "market_interests" ADD CONSTRAINT "market_interests_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "market_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_interests" ADD CONSTRAINT "market_interests_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Offers & opportunities
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "couponCode" TEXT,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "offers_active_sortOrder_idx" ON "offers"("active", "sortOrder");
ALTER TABLE "offers" ADD CONSTRAINT "offers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
