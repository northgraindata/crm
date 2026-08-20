CREATE TYPE "ContactStatus_new" AS ENUM (
  'TO_RESEARCH',
  'READY_TO_CONTACT',
  'CONTACTED_AWAITING_REPLY',
  'ACTIVE_CONVERSATION',
  'FOLLOW_UP_DUE',
  'NURTURE',
  'CLOSED_IRRELEVANT'
);

ALTER TABLE "contact" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "contact"
ALTER COLUMN "status" TYPE "ContactStatus_new"
USING CASE "status"::text
  WHEN 'TO_CONTACT' THEN 'READY_TO_CONTACT'::"ContactStatus_new"
  WHEN 'CONTACTED' THEN 'CONTACTED_AWAITING_REPLY'::"ContactStatus_new"
END;

ALTER TYPE "ContactStatus" RENAME TO "ContactStatus_old";
ALTER TYPE "ContactStatus_new" RENAME TO "ContactStatus";
DROP TYPE "ContactStatus_old";

ALTER TABLE "contact"
ALTER COLUMN "status" SET DEFAULT 'TO_RESEARCH';
