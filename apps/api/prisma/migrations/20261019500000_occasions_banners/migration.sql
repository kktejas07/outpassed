-- Occasions: time-boxed campaigns (Diwali sale, exam season, freshers' move-in)
-- that group sponsored offers and student listings under one themed banner.
CREATE TABLE "occasions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'indigo',
    "icon" TEXT NOT NULL DEFAULT 'sparkles',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "occasions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "occasions_active_startsAt_endsAt_idx" ON "occasions"("active", "startsAt", "endsAt");
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Offers can be featured in the banner strip and tagged to an occasion.
ALTER TABLE "offers" ADD COLUMN "showAsBanner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offers" ADD COLUMN "occasionId" TEXT;
ALTER TABLE "offers" ADD CONSTRAINT "offers_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "occasions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Student listings can be part of an occasion's sale.
ALTER TABLE "market_items" ADD COLUMN "occasionId" TEXT;
ALTER TABLE "market_items" ADD CONSTRAINT "market_items_occasionId_fkey" FOREIGN KEY ("occasionId") REFERENCES "occasions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "market_items_occasionId_idx" ON "market_items"("occasionId");
