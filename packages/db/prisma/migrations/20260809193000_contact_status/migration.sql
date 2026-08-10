CREATE TYPE "ContactStatus" AS ENUM ('TO_CONTACT', 'CONTACTED');

ALTER TABLE "contact" ADD COLUMN "status" "ContactStatus" NOT NULL DEFAULT 'CONTACTED';

CREATE INDEX "contact_status_idx" ON "contact"("status");
