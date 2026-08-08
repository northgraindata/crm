ALTER TABLE "mailboxSync"
ADD COLUMN "authAccountId" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "mailboxAddress" TEXT,
ADD COLUMN "displayName" TEXT;

UPDATE "mailboxSync" AS sync
SET
  "authAccountId" = account."id",
  "externalId" = 'primary'
FROM "account" AS account
WHERE account."userId" = sync."userId"
  AND account."providerId" = CASE
    WHEN sync."source" IN ('calendar', 'gmail') THEN 'google'
    WHEN sync."source" = 'outlook' THEN 'microsoft'
  END;

DELETE FROM "mailboxSync" WHERE "authAccountId" IS NULL;

ALTER TABLE "mailboxSync"
ALTER COLUMN "authAccountId" SET NOT NULL,
ALTER COLUMN "externalId" SET NOT NULL;

DROP INDEX "mailboxSync_userId_source_key";

CREATE UNIQUE INDEX "mailboxSync_authAccountId_source_externalId_key"
ON "mailboxSync"("authAccountId", "source", "externalId");

CREATE INDEX "mailboxSync_userId_source_idx"
ON "mailboxSync"("userId", "source");

ALTER TABLE "mailboxSync"
ADD CONSTRAINT "mailboxSync_authAccountId_fkey"
FOREIGN KEY ("authAccountId") REFERENCES "account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emailMessage"
ADD COLUMN "syncedByMailboxId" TEXT,
ADD COLUMN "zohoMessageId" TEXT;

CREATE INDEX "emailMessage_syncedByMailboxId_idx"
ON "emailMessage"("syncedByMailboxId");

ALTER TABLE "emailMessage"
ADD CONSTRAINT "emailMessage_syncedByMailboxId_fkey"
FOREIGN KEY ("syncedByMailboxId") REFERENCES "mailboxSync"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "calendarEvent"
ADD COLUMN "syncedByMailboxId" TEXT;

CREATE INDEX "calendarEvent_syncedByMailboxId_idx"
ON "calendarEvent"("syncedByMailboxId");

ALTER TABLE "calendarEvent"
ADD CONSTRAINT "calendarEvent_syncedByMailboxId_fkey"
FOREIGN KEY ("syncedByMailboxId") REFERENCES "mailboxSync"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
