CREATE TYPE "WorkTaskStatus" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE');
CREATE TYPE "WorkTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TimeEntrySource" AS ENUM ('TIMER', 'MANUAL');
CREATE TYPE "TeamMemberDocumentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ARCHIVED');
CREATE TYPE "ReminderChannel" AS ENUM ('CRM', 'EMAIL');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'DISMISSED');

ALTER TABLE "teamMember" ADD COLUMN "email" TEXT;

CREATE TABLE "workTask" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "WorkTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "timeEntry" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "workTaskId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "source" "TimeEntrySource" NOT NULL DEFAULT 'MANUAL',
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyCostSnapshot" DECIMAL(14,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timeEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teamMemberDocument" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TeamMemberDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reminderDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teamMemberDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "teamMemberReminder" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teamMemberReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workTask_engagementId_status_sortOrder_idx" ON "workTask"("engagementId", "status", "sortOrder");
CREATE INDEX "workTask_assigneeId_status_idx" ON "workTask"("assigneeId", "status");
CREATE INDEX "workTask_dueAt_idx" ON "workTask"("dueAt");
CREATE INDEX "timeEntry_teamMemberId_workDate_idx" ON "timeEntry"("teamMemberId", "workDate");
CREATE INDEX "timeEntry_engagementId_workDate_idx" ON "timeEntry"("engagementId", "workDate");
CREATE INDEX "timeEntry_workTaskId_idx" ON "timeEntry"("workTaskId");
CREATE INDEX "timeEntry_startedAt_endedAt_idx" ON "timeEntry"("startedAt", "endedAt");
CREATE INDEX "teamMemberDocument_teamMemberId_status_idx" ON "teamMemberDocument"("teamMemberId", "status");
CREATE INDEX "teamMemberDocument_expiresAt_idx" ON "teamMemberDocument"("expiresAt");
CREATE UNIQUE INDEX "teamMemberReminder_documentId_channel_dueAt_key" ON "teamMemberReminder"("documentId", "channel", "dueAt");
CREATE INDEX "teamMemberReminder_status_dueAt_idx" ON "teamMemberReminder"("status", "dueAt");

ALTER TABLE "workTask" ADD CONSTRAINT "workTask_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workTask" ADD CONSTRAINT "workTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "teamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "timeEntry" ADD CONSTRAINT "timeEntry_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "teamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeEntry" ADD CONSTRAINT "timeEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeEntry" ADD CONSTRAINT "timeEntry_workTaskId_fkey" FOREIGN KEY ("workTaskId") REFERENCES "workTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "teamMemberDocument" ADD CONSTRAINT "teamMemberDocument_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "teamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teamMemberReminder" ADD CONSTRAINT "teamMemberReminder_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "teamMemberDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
