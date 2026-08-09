CREATE TYPE "SurveyStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "SurveyResponseStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED');
CREATE TYPE "SurveyAnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED');

ALTER TABLE "agentTask" ADD COLUMN "surveyResponseId" TEXT;

CREATE TABLE "survey" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "questionCount" INTEGER,
    "definition" JSONB,
    "status" "SurveyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "surveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "SurveyResponseStatus" NOT NULL DEFAULT 'STARTED',
    "analysisStatus" "SurveyAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "contactId" TEXT,
    "companyId" TEXT,
    "respondentName" TEXT NOT NULL,
    "respondentEmail" TEXT NOT NULL,
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "priority" JSONB,
    "incentive" JSONB,
    "sourceUrl" TEXT,
    "userAgent" TEXT,
    "analysis" JSONB,
    "analysisError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    CONSTRAINT "surveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "surveyResponseEvent" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "SurveyResponseStatus" NOT NULL,
    "currentIndex" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "priority" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "surveyResponseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survey_slug_key" ON "survey"("slug");
CREATE INDEX "survey_status_idx" ON "survey"("status");
CREATE UNIQUE INDEX "surveyResponse_surveyId_sessionId_key" ON "surveyResponse"("surveyId", "sessionId");
CREATE INDEX "surveyResponse_surveyId_status_idx" ON "surveyResponse"("surveyId", "status");
CREATE INDEX "surveyResponse_contactId_idx" ON "surveyResponse"("contactId");
CREATE INDEX "surveyResponse_companyId_idx" ON "surveyResponse"("companyId");
CREATE INDEX "surveyResponse_analysisStatus_idx" ON "surveyResponse"("analysisStatus");
CREATE INDEX "surveyResponse_lastSavedAt_idx" ON "surveyResponse"("lastSavedAt");
CREATE UNIQUE INDEX "surveyResponseEvent_responseId_eventId_key" ON "surveyResponseEvent"("responseId", "eventId");
CREATE INDEX "surveyResponseEvent_responseId_receivedAt_idx" ON "surveyResponseEvent"("responseId", "receivedAt");
CREATE INDEX "agentTask_surveyResponseId_idx" ON "agentTask"("surveyResponseId");

ALTER TABLE "surveyResponse"
ADD CONSTRAINT "surveyResponse_surveyId_fkey"
FOREIGN KEY ("surveyId") REFERENCES "survey"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "surveyResponse_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "surveyResponse_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "surveyResponseEvent"
ADD CONSTRAINT "surveyResponseEvent_responseId_fkey"
FOREIGN KEY ("responseId") REFERENCES "surveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
