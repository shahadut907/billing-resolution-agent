/*
  Warnings:

  - Added the required column `updatedAt` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Policy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('ENTITLEMENT_REPAIR', 'DUPLICATE_INVOICE_CORRECTION');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PROPOSED', 'APPLIED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ProposalDecision" AS ENUM ('APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ProposalAuditEvent" AS ENUM ('PROPOSAL_CREATED', 'DECISION_RECORDED', 'APPROVAL_REJECTED', 'APPLY_SUCCEEDED', 'APPLY_FAILED');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Policy" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Policy" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Subscription" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ActionProposal" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "payload" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "recordVersions" JSONB NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decision" "ProposalDecision",
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "applyError" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppliedAction" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actionType" "ActionType" NOT NULL,
    "proposalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppliedAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAudit" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "event" "ProposalAuditEvent" NOT NULL,
    "actor" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEscalation" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "escalatedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActionProposal_investigationId_key" ON "ActionProposal"("investigationId");

-- CreateIndex
CREATE INDEX "ActionProposal_ticketId_idx" ON "ActionProposal"("ticketId");

-- CreateIndex
CREATE INDEX "ActionProposal_status_idx" ON "ActionProposal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AppliedAction_proposalId_key" ON "AppliedAction"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "AppliedAction_ticketId_actionType_key" ON "AppliedAction"("ticketId", "actionType");

-- CreateIndex
CREATE INDEX "ProposalAudit_proposalId_idx" ON "ProposalAudit"("proposalId");

-- CreateIndex
CREATE INDEX "TicketEscalation_ticketId_idx" ON "TicketEscalation"("ticketId");

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionProposal" ADD CONSTRAINT "ActionProposal_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedAction" ADD CONSTRAINT "AppliedAction_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppliedAction" ADD CONSTRAINT "AppliedAction_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ActionProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAudit" ADD CONSTRAINT "ProposalAudit_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "ActionProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEscalation" ADD CONSTRAINT "TicketEscalation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
