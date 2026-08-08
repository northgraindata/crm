CREATE TABLE "apiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apiToken_tokenHash_key" ON "apiToken"("tokenHash");
CREATE INDEX "apiToken_userId_revokedAt_idx" ON "apiToken"("userId", "revokedAt");

ALTER TABLE "apiToken" ADD CONSTRAINT "apiToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
