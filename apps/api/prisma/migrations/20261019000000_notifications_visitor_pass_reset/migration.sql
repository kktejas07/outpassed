-- Overdue alerts are sent once per pass
ALTER TABLE "outpasses" ADD COLUMN "overdueAlertedAt" TIMESTAMP(3);

-- Visitor entry code and public pass link. Existing visits get generated values.
ALTER TABLE "visits" ADD COLUMN "code" TEXT;
ALTER TABLE "visits" ADD COLUMN "passToken" TEXT;
UPDATE "visits"
SET "code" = lpad(floor(random() * 1000000)::int::text, 6, '0'),
    "passToken" = md5(random()::text || "id");
ALTER TABLE "visits" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "visits" ALTER COLUMN "passToken" SET NOT NULL;
CREATE UNIQUE INDEX "visits_passToken_key" ON "visits"("passToken");
CREATE INDEX "visits_code_idx" ON "visits"("code");

-- In-app notifications
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phone push tokens
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Password reset codes
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "password_resets_userId_createdAt_idx" ON "password_resets"("userId", "createdAt");
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
