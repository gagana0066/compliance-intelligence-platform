-- Create enums
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'ANALYST', 'REVIEWER');
CREATE TYPE "RuleField" AS ENUM ('DOCUMENTS_COUNT', 'DEADLINE_IS_PAST', 'CASE_TYPE');
CREATE TYPE "RuleOperator" AS ENUM ('LT', 'LTE', 'GT', 'GTE', 'EQ', 'NEQ', 'CONTAINS');

-- Create multitenant core tables
CREATE TABLE "Firm" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'ANALYST',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "firmId" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComplianceRule" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "severity" "Severity" NOT NULL,
  "weight" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "firmId" TEXT NOT NULL,
  CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RuleCondition" (
  "id" TEXT NOT NULL,
  "field" "RuleField" NOT NULL,
  "operator" "RuleOperator" NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ruleId" TEXT NOT NULL,
  CONSTRAINT "RuleCondition_pkey" PRIMARY KEY ("id")
);

-- Seed default firm for existing data
INSERT INTO "Firm" ("id", "name", "slug", "updatedAt")
SELECT 'default-firm', 'Default Law Firm', 'default-law-firm', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Firm" WHERE "slug" = 'default-law-firm'
);

-- Upgrade Case model for tenancy and AI summary
ALTER TABLE "Case" ADD COLUMN "aiSummary" TEXT;
ALTER TABLE "Case" ADD COLUMN "firmId" TEXT NOT NULL DEFAULT 'default-firm';
ALTER TABLE "Case" ADD COLUMN "ownerUserId" TEXT;

-- Upgrade risk level from text to enum
ALTER TABLE "Case" ALTER COLUMN "riskLevel" DROP DEFAULT;
ALTER TABLE "Case"
ALTER COLUMN "riskLevel" TYPE "Severity"
USING ("riskLevel"::"Severity");
ALTER TABLE "Case" ALTER COLUMN "riskLevel" SET DEFAULT 'LOW';

-- Upgrade findings for typed severity and optional rule linkage
ALTER TABLE "AuditFinding" ADD COLUMN "ruleRefId" TEXT;
ALTER TABLE "AuditFinding"
ALTER COLUMN "severity" TYPE "Severity"
USING ("severity"::"Severity");

-- Indexes and uniqueness
CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "ComplianceRule_firmId_code_key" ON "ComplianceRule"("firmId", "code");

CREATE INDEX "Case_firmId_idx" ON "Case"("firmId");
CREATE INDEX "Case_createdAt_idx" ON "Case"("createdAt");
CREATE INDEX "ComplianceRule_firmId_enabled_idx" ON "ComplianceRule"("firmId", "enabled");
CREATE INDEX "AuditFinding_caseId_idx" ON "AuditFinding"("caseId");

-- Foreign keys
ALTER TABLE "User"
ADD CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComplianceRule"
ADD CONSTRAINT "ComplianceRule_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RuleCondition"
ADD CONSTRAINT "RuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ComplianceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Case"
ADD CONSTRAINT "Case_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Case"
ADD CONSTRAINT "Case_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditFinding"
ADD CONSTRAINT "AuditFinding_ruleRefId_fkey" FOREIGN KEY ("ruleRefId") REFERENCES "ComplianceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove transitional default after backfill safety
ALTER TABLE "Case" ALTER COLUMN "firmId" DROP DEFAULT;
