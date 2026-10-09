-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgCategory" AS ENUM ('employer', 'ossProgram', 'fellowshipFunder', 'scholarshipFunder', 'hackathonHost', 'community', 'trainingProvider', 'accelerator', 'government', 'university');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('feed', 'sitemap', 'html', 'api', 'manual');

-- CreateEnum
CREATE TYPE "Cadence" AS ENUM ('rolling', 'monthly', 'quarterly', 'annual', 'unpredictable');

-- CreateEnum
CREATE TYPE "OpportunityKind" AS ENUM ('internship', 'job', 'fellowship', 'scholarship', 'grant', 'hackathon', 'ossProgram', 'event', 'competition', 'accelerator', 'bootcamp');

-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('fixed', 'rolling', 'multiRound', 'unknown');

-- CreateEnum
CREATE TYPE "LocationMode" AS ENUM ('remote', 'onsite', 'hybrid');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('review', 'published', 'closed', 'rejected');

-- CreateEnum
CREATE TYPE "DiscoveredVia" AS ENUM ('feed', 'sitemap', 'html', 'api', 'submission', 'whatsapp', 'manual');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('rules', 'llm', 'manual');

-- CreateEnum
CREATE TYPE "SubmissionChannel" AS ENUM ('web', 'whatsapp', 'manual');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('new', 'merged', 'rejected', 'duplicate');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OrgCategory" NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "description" TEXT,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "logoUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "registryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "url" TEXT NOT NULL,
    "adapter" TEXT,
    "cadence" "Cadence" NOT NULL DEFAULT 'unpredictable',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastYieldAt" TIMESTAMP(3),
    "consecutiveEmpty" INTEGER NOT NULL DEFAULT 0,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "baselineWeeklyYield" DOUBLE PRECISION,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "nFound" INTEGER NOT NULL DEFAULT 0,
    "nNew" INTEGER NOT NULL DEFAULT 0,
    "nChanged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "fetch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "title" TEXT,
    "text" TEXT NOT NULL,
    "meta" JSONB,
    "publishedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "raw_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rawItemId" TEXT,
    "submissionId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "OpportunityKind" NOT NULL,
    "summary" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "applyUrl" TEXT,
    "opensAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "deadlineKind" "DeadlineKind" NOT NULL DEFAULT 'unknown',
    "deadlineTimezone" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "locationMode" "LocationMode" NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "venueName" TEXT,
    "venueAddress" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geoSource" TEXT,
    "regionsTags" TEXT[],
    "requirementsText" TEXT,
    "tags" TEXT[],
    "extracted" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL,
    "fieldConfidence" JSONB,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'review',
    "statusReason" TEXT,
    "discoveredVia" "DiscoveredVia" NOT NULL,
    "identityKey" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "senderHint" TEXT,
    "channel" "SubmissionChannel" NOT NULL,
    "ipHash" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'new',
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extractions" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_meters" (
    "period" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("period")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_country_category_idx" ON "organizations"("country", "category");

-- CreateIndex
CREATE UNIQUE INDEX "sources_key_key" ON "sources"("key");

-- CreateIndex
CREATE INDEX "sources_enabled_kind_idx" ON "sources"("enabled", "kind");

-- CreateIndex
CREATE INDEX "fetch_runs_sourceId_startedAt_idx" ON "fetch_runs"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "raw_items_contentHash_idx" ON "raw_items"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "raw_items_sourceId_canonicalUrl_key" ON "raw_items"("sourceId", "canonicalUrl");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_slug_key" ON "opportunities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_submissionId_key" ON "opportunities"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_canonicalUrl_key" ON "opportunities"("canonicalUrl");

-- CreateIndex
CREATE INDEX "opportunities_status_deadlineAt_idx" ON "opportunities"("status", "deadlineAt");

-- CreateIndex
CREATE INDEX "opportunities_status_kind_country_city_idx" ON "opportunities"("status", "kind", "country", "city");

-- CreateIndex
CREATE INDEX "opportunities_status_startsAt_idx" ON "opportunities"("status", "startsAt");

-- CreateIndex
CREATE INDEX "opportunities_organizationId_status_idx" ON "opportunities"("organizationId", "status");

-- CreateIndex
CREATE INDEX "opportunities_identityKey_idx" ON "opportunities"("identityKey");

-- CreateIndex
CREATE INDEX "submissions_status_receivedAt_idx" ON "submissions"("status", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "extractions_contentHash_model_promptVersion_key" ON "extractions"("contentHash", "model", "promptVersion");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fetch_runs" ADD CONSTRAINT "fetch_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "raw_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

