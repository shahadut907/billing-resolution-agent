-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "UncertaintyLevel" AS ENUM ('CONFIRMED', 'LIKELY', 'UNCERTAIN', 'UNRESOLVABLE');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NextStepType" AS ENUM ('PLATFORM_OPS_REACTIVATION', 'DUPLICATE_INVOICE_VERIFICATION', 'SECURITY_ESCALATION', 'FINANCIAL_REVIEW', 'CHARGE_VERIFICATION');

-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "isMock" BOOLEAN NOT NULL,
    "diagnosis" TEXT,
    "uncertainty" "UncertaintyLevel",
    "riskCategory" "RiskCategory",
    "proposedNextStepType" "NextStepType",
    "proposedNextStepDetail" TEXT,
    "draftReply" TEXT,
    "supportingEvidence" JSONB,
    "contradictingEvidence" JSONB,
    "toolTrace" JSONB NOT NULL,
    "bounds" JSONB NOT NULL,
    "policyOverrides" TEXT[],
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investigation_ticketId_idx" ON "Investigation"("ticketId");

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
