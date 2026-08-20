CREATE TYPE "DealCompanyRole" AS ENUM ('END_CLIENT', 'ASSOCIATED');

CREATE TABLE "dealCompany" (
    "dealId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "DealCompanyRole" NOT NULL DEFAULT 'ASSOCIATED',

    CONSTRAINT "dealCompany_pkey" PRIMARY KEY ("dealId","companyId")
);

CREATE INDEX "dealCompany_companyId_idx" ON "dealCompany"("companyId");

ALTER TABLE "dealCompany" ADD CONSTRAINT "dealCompany_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dealCompany" ADD CONSTRAINT "dealCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
