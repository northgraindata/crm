CREATE TYPE "DealStage_new" AS ENUM ('DISCOVERY', 'QUALIFIED', 'SCOPING', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');

ALTER TABLE "deal" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "deal"
ALTER COLUMN "stage" TYPE "DealStage_new"
USING CASE "stage"::text
  WHEN 'DEMO_BOOKED' THEN 'DISCOVERY'::"DealStage_new"
  WHEN 'QUALIFIED_TO_BUY' THEN 'QUALIFIED'::"DealStage_new"
  WHEN 'UNQUALIFIED_TO_BUY' THEN 'CLOSED_LOST'::"DealStage_new"
  WHEN 'DECISION_MAKER_BOUGHT_IN' THEN 'SCOPING'::"DealStage_new"
  WHEN 'CONTRACT_SENT' THEN 'PROPOSAL'::"DealStage_new"
  ELSE "stage"::text::"DealStage_new"
END;

DROP TYPE "DealStage";
ALTER TYPE "DealStage_new" RENAME TO "DealStage";
ALTER TABLE "deal" ALTER COLUMN "stage" SET DEFAULT 'DISCOVERY';

CREATE TYPE "EngagementType" AS ENUM ('SPRINT', 'AUDIT', 'EMBEDDED', 'SUBCONTRACTING');
CREATE TYPE "EngagementStatus" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BillingModel" AS ENUM ('FIXED', 'HOURLY', 'DAILY', 'MONTHLY');
CREATE TYPE "TestimonialStatus" AS ENUM ('NOT_REQUESTED', 'PLANNED', 'REQUESTED', 'RECEIVED', 'DECLINED');
CREATE TYPE "CaseStudyStatus" AS ENUM ('UNAVAILABLE', 'CANDIDATE', 'APPROVED', 'PUBLISHED');
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'CONTRACTOR', 'AGENCY');

CREATE TABLE "teamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'EMPLOYEE',
    "hourlyCost" DECIMAL(14,2),
    "weeklyCapacity" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "engagement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceDealId" TEXT,
    "type" "EngagementType" NOT NULL,
    "status" "EngagementStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "contractValue" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingModel" "BillingModel" NOT NULL,
    "deliveryLeadId" TEXT,
    "estimatedHours" DECIMAL(12,2),
    "actualHours" DECIMAL(12,2),
    "deliveryCost" DECIMAL(14,2),
    "grossMargin" DECIMAL(14,2),
    "testimonialStatus" "TestimonialStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "caseStudyStatus" "CaseStudyStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "engagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "engagementAssignment" (
    "engagementId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "role" TEXT,
    "estimatedHours" DECIMAL(12,2),
    "actualHours" DECIMAL(12,2),
    "hourlyCostSnapshot" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "engagementAssignment_pkey" PRIMARY KEY ("engagementId", "teamMemberId")
);

CREATE UNIQUE INDEX "teamMember_userId_key" ON "teamMember"("userId");
CREATE INDEX "teamMember_status_idx" ON "teamMember"("status");
CREATE INDEX "teamMember_employmentType_idx" ON "teamMember"("employmentType");
CREATE INDEX "engagement_companyId_idx" ON "engagement"("companyId");
CREATE INDEX "engagement_sourceDealId_idx" ON "engagement"("sourceDealId");
CREATE INDEX "engagement_status_idx" ON "engagement"("status");
CREATE INDEX "engagement_endDate_idx" ON "engagement"("endDate");
CREATE INDEX "engagementAssignment_teamMemberId_idx" ON "engagementAssignment"("teamMemberId");

ALTER TABLE "teamMember"
ADD CONSTRAINT "teamMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engagement"
ADD CONSTRAINT "engagement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "engagement_sourceDealId_fkey"
FOREIGN KEY ("sourceDealId") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "engagement_deliveryLeadId_fkey"
FOREIGN KEY ("deliveryLeadId") REFERENCES "teamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "engagementAssignment"
ADD CONSTRAINT "engagementAssignment_engagementId_fkey"
FOREIGN KEY ("engagementId") REFERENCES "engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "engagementAssignment_teamMemberId_fkey"
FOREIGN KEY ("teamMemberId") REFERENCES "teamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "fieldDefinition" ("id", "entity", "key", "label", "type", "agentFilled", "agentBrief", "position", "updatedAt")
VALUES
  ('system-company-type', 'COMPANY', 'company_type', 'Company type', 'SELECT', true, 'Classify the organisation from observed evidence.', 100, NOW()),
  ('system-company-partner-type', 'COMPANY', 'partner_type', 'Partner type', 'SELECT', true, 'Classify the partnership role from observed evidence.', 101, NOW()),
  ('system-company-relationship-strength', 'COMPANY', 'relationship_strength', 'Relationship strength', 'SELECT', false, 'Use only when the relationship strength is known from CRM activity.', 102, NOW()),
  ('system-company-icp-fit', 'COMPANY', 'icp_fit', 'ICP fit', 'SELECT', true, 'Estimate ICP fit from the company and its current signals.', 103, NOW()),
  ('system-company-lead-source', 'COMPANY', 'lead_source', 'Source', 'SELECT', false, 'Record how this company entered the relationship pipeline.', 104, NOW()),
  ('system-contact-relationship-role', 'CONTACT', 'relationship_role', 'Relationship role', 'SELECT', true, 'Classify the person based on evidence and relationship context.', 100, NOW()),
  ('system-contact-relationship-strength', 'CONTACT', 'relationship_strength', 'Relationship strength', 'SELECT', false, 'Use only when the relationship strength is known from CRM activity.', 101, NOW()),
  ('system-contact-origin', 'CONTACT', 'contact_origin', 'Contact origin', 'SELECT', false, 'Record how this person entered the relationship pipeline.', 102, NOW()),
  ('system-contact-linkedin-status', 'CONTACT', 'linkedin_connection_status', 'LinkedIn connection status', 'SELECT', false, 'Record the confirmed LinkedIn connection state.', 103, NOW()),
  ('system-contact-linkedin-connected-at', 'CONTACT', 'linkedin_connected_at', 'LinkedIn connected at', 'DATE', false, 'Record the date a LinkedIn connection was confirmed.', 104, NOW()),
  ('system-contact-do-not-contact', 'CONTACT', 'do_not_contact', 'Do not contact', 'CHECKBOX', false, 'Only set when the rep explicitly requests no outreach.', 105, NOW()),
  ('system-deal-type', 'DEAL', 'deal_type', 'Deal type', 'SELECT', false, 'Classify the commercial opportunity.', 100, NOW()),
  ('system-deal-source', 'DEAL', 'lead_source', 'Source', 'SELECT', false, 'Record how this deal entered the pipeline.', 101, NOW()),
  ('system-deal-trigger', 'DEAL', 'trigger', 'Trigger', 'SELECT', true, 'Record the observed business trigger for the opportunity.', 102, NOW())
ON CONFLICT ("entity", "key") DO NOTHING;

INSERT INTO "fieldOption" ("id", "fieldId", "label", "position")
VALUES
  ('company-type-prospect', 'system-company-type', 'Prospect', 0),
  ('company-type-client', 'system-company-type', 'Client', 1),
  ('company-type-former-client', 'system-company-type', 'Former client', 2),
  ('company-type-partner', 'system-company-type', 'Partner', 3),
  ('company-type-recruiter', 'system-company-type', 'Recruiter agency', 4),
  ('company-type-contractor', 'system-company-type', 'Contractor agency', 5),
  ('company-type-technology', 'system-company-type', 'Technology vendor', 6),
  ('company-type-peer', 'system-company-type', 'Peer', 7),
  ('company-type-other', 'system-company-type', 'Other', 8),
  ('partner-type-delivery', 'system-company-partner-type', 'Delivery', 0),
  ('partner-type-referral', 'system-company-partner-type', 'Referral', 1),
  ('partner-type-technology', 'system-company-partner-type', 'Technology', 2),
  ('partner-type-recruiter', 'system-company-partner-type', 'Recruiter', 3),
  ('partner-type-agency', 'system-company-partner-type', 'Agency', 4),
  ('partner-type-consultant', 'system-company-partner-type', 'Consultant', 5),
  ('partner-type-none', 'system-company-partner-type', 'None', 6),
  ('relationship-strength-cold', 'system-company-relationship-strength', 'Cold', 0),
  ('relationship-strength-known', 'system-company-relationship-strength', 'Known', 1),
  ('relationship-strength-warm', 'system-company-relationship-strength', 'Warm', 2),
  ('relationship-strength-strong', 'system-company-relationship-strength', 'Strong', 3),
  ('icp-fit-unknown', 'system-company-icp-fit', 'Unknown', 0),
  ('icp-fit-low', 'system-company-icp-fit', 'Low', 1),
  ('icp-fit-medium', 'system-company-icp-fit', 'Medium', 2),
  ('icp-fit-high', 'system-company-icp-fit', 'High', 3),
  ('lead-source-linkedin-company', 'system-company-lead-source', 'LinkedIn', 0),
  ('lead-source-inbound-company', 'system-company-lead-source', 'Inbound', 1),
  ('lead-source-outbound-company', 'system-company-lead-source', 'Outbound', 2),
  ('lead-source-referral-company', 'system-company-lead-source', 'Referral', 3),
  ('lead-source-content-company', 'system-company-lead-source', 'Content', 4),
  ('lead-source-event-company', 'system-company-lead-source', 'Event', 5),
  ('lead-source-network-company', 'system-company-lead-source', 'Existing network', 6),
  ('lead-source-other-company', 'system-company-lead-source', 'Other', 7),
  ('relationship-role-buyer', 'system-contact-relationship-role', 'Buyer', 0),
  ('relationship-role-decision-maker', 'system-contact-relationship-role', 'Decision maker', 1),
  ('relationship-role-champion', 'system-contact-relationship-role', 'Champion', 2),
  ('relationship-role-influencer', 'system-contact-relationship-role', 'Influencer', 3),
  ('relationship-role-partner', 'system-contact-relationship-role', 'Partner contact', 4),
  ('relationship-role-recruiter', 'system-contact-relationship-role', 'Recruiter', 5),
  ('relationship-role-peer', 'system-contact-relationship-role', 'Peer', 6),
  ('relationship-role-other', 'system-contact-relationship-role', 'Other', 7),
  ('contact-origin-inbound', 'system-contact-origin', 'LinkedIn inbound', 0),
  ('contact-origin-outbound', 'system-contact-origin', 'LinkedIn outbound', 1),
  ('contact-origin-content', 'system-contact-origin', 'Content engagement', 2),
  ('contact-origin-referral', 'system-contact-origin', 'Referral', 3),
  ('contact-origin-email', 'system-contact-origin', 'Email', 4),
  ('contact-origin-network', 'system-contact-origin', 'Existing network', 5),
  ('contact-origin-other', 'system-contact-origin', 'Other', 6),
  ('linkedin-status-invited-by-us', 'system-contact-linkedin-status', 'Invited by us', 0),
  ('linkedin-status-invited-us', 'system-contact-linkedin-status', 'Invited us', 1),
  ('linkedin-status-connected', 'system-contact-linkedin-status', 'Connected', 2),
  ('linkedin-status-not-connected', 'system-contact-linkedin-status', 'Not connected', 3),
  ('linkedin-status-unknown', 'system-contact-linkedin-status', 'Unknown', 4),
  ('deal-type-sprint', 'system-deal-type', 'Data engineering sprint', 0),
  ('deal-type-audit', 'system-deal-type', 'Audit', 1),
  ('deal-type-embedded', 'system-deal-type', 'Embedded engineering', 2),
  ('deal-type-subcontracting', 'system-deal-type', 'Subcontracting', 3),
  ('deal-type-other', 'system-deal-type', 'Other', 4),
  ('deal-source-outbound', 'system-deal-source', 'Outbound', 0),
  ('deal-source-inbound', 'system-deal-source', 'Inbound', 1),
  ('deal-source-referral', 'system-deal-source', 'Referral', 2),
  ('deal-source-partner', 'system-deal-source', 'Partner', 3),
  ('deal-source-content', 'system-deal-source', 'Content', 4),
  ('deal-source-network', 'system-deal-source', 'Existing network', 5),
  ('deal-trigger-hiring', 'system-deal-trigger', 'Hiring', 0),
  ('deal-trigger-capacity', 'system-deal-trigger', 'Lack of capacity', 1),
  ('deal-trigger-migration', 'system-deal-trigger', 'Migration', 2),
  ('deal-trigger-integration', 'system-deal-trigger', 'System integration', 3),
  ('deal-trigger-reporting', 'system-deal-trigger', 'Reporting', 4),
  ('deal-trigger-automation', 'system-deal-trigger', 'Automation', 5),
  ('deal-trigger-rebuild', 'system-deal-trigger', 'Platform rebuild', 6),
  ('deal-trigger-cost', 'system-deal-trigger', 'Cost optimisation', 7),
  ('deal-trigger-ai', 'system-deal-trigger', 'AI initiative', 8),
  ('deal-trigger-other', 'system-deal-trigger', 'Other', 9)
ON CONFLICT ("id") DO NOTHING;
