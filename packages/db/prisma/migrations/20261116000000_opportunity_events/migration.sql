-- CreateEnum
CREATE TYPE "OpportunityEventActor" AS ENUM ('admin', 'engine');

-- CreateEnum
CREATE TYPE "OpportunityEventAction" AS ENUM ('created', 'edited', 'published', 'unpublished', 'rejected', 'markedDuplicate', 'deadlineChanged', 'closed');

-- CreateTable
CREATE TABLE "opportunity_events" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" "OpportunityEventActor" NOT NULL,
    "action" "OpportunityEventAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "note" TEXT,

    CONSTRAINT "opportunity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunity_events_opportunityId_at_idx" ON "opportunity_events"("opportunityId", "at" DESC);

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

