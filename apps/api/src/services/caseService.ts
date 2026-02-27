import { Prisma } from "@prisma/client";
import { calculateRiskFromWeights } from "../domain/risk";
import { prisma } from "../lib/prisma";
import { generateComplianceSummary } from "./aiSummary";
import { evaluateRulesForCase } from "./ruleEngineService";
import { ensureBaselineRulesForFirm } from "./ruleService";

export type CreateCaseInput = {
  clientName: string;
  caseType: string;
  owner: string;
  deadline: string;
  documentsCount: number;
  firmId?: string;
  firmSlug?: string;
};

async function resolveFirm(params: { firmId?: string; firmSlug?: string }) {
  if (params.firmId) {
    const firm = await prisma.firm.findUnique({ where: { id: params.firmId } });
    if (firm) return firm;
  }

  if (params.firmSlug) {
    const firm = await prisma.firm.findUnique({ where: { slug: params.firmSlug } });
    if (firm) return firm;
  }

  return prisma.firm.findUnique({ where: { slug: "default-law-firm" } });
}

export async function listCases(firmId?: string) {
  return prisma.case.findMany({
    where: firmId ? { firmId } : undefined,
    include: {
      findings: true,
      firm: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function evaluateAndPersistCaseRisk(
  tx: Prisma.TransactionClient,
  params: {
    caseId: string;
    firmId: string;
    clientName: string;
    caseType: string;
    owner: string;
    deadline: Date;
    documentsCount: number;
  }
) {
  const evaluatedFindings = await evaluateRulesForCase({
    firmId: params.firmId,
    ruleCase: {
      clientName: params.clientName,
      caseType: params.caseType,
      owner: params.owner,
      deadline: params.deadline,
      documentsCount: params.documentsCount,
    },
    tx,
  });

  await tx.auditFinding.deleteMany({ where: { caseId: params.caseId } });

  if (evaluatedFindings.length > 0) {
    await tx.auditFinding.createMany({
      data: evaluatedFindings.map((finding) => ({
        caseId: params.caseId,
        ruleId: finding.ruleId,
        ruleRefId: finding.ruleRefId,
        severity: finding.severity,
        message: finding.message,
      })),
    });
  }

  const { riskScore, riskLevel } = calculateRiskFromWeights(evaluatedFindings);

  const aiSummary = generateComplianceSummary({
    clientName: params.clientName,
    caseType: params.caseType,
    findings: evaluatedFindings.map((finding) => ({
      severity: finding.severity,
      message: finding.message,
    })),
    riskLevel,
  });

  await tx.case.update({
    where: { id: params.caseId },
    data: {
      riskScore,
      riskLevel,
      aiSummary,
    },
  });
}

export async function createCase(input: CreateCaseInput) {
  const firm = await resolveFirm({ firmId: input.firmId, firmSlug: input.firmSlug });

  if (!firm) {
    throw new Error("Firm not found. Create a firm before creating cases.");
  }

  await ensureBaselineRulesForFirm(firm.id);

  const deadline = new Date(input.deadline);
  if (Number.isNaN(deadline.getTime())) {
    throw new Error("Invalid deadline.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const createdCase = await tx.case.create({
      data: {
        firmId: firm.id,
        clientName: input.clientName,
        caseType: input.caseType,
        owner: input.owner,
        deadline,
        documentsCount: input.documentsCount,
      },
    });

    await evaluateAndPersistCaseRisk(tx, {
      caseId: createdCase.id,
      firmId: firm.id,
      clientName: input.clientName,
      caseType: input.caseType,
      owner: input.owner,
      deadline,
      documentsCount: input.documentsCount,
    });

    return tx.case.findUniqueOrThrow({
      where: { id: createdCase.id },
      include: {
        findings: true,
        firm: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  });

  return created;
}

export async function reevaluateCase(caseId: string) {
  return prisma.$transaction(async (tx) => {
    const foundCase = await tx.case.findUnique({
      where: { id: caseId },
    });

    if (!foundCase) return null;

    await evaluateAndPersistCaseRisk(tx, {
      caseId: foundCase.id,
      firmId: foundCase.firmId,
      clientName: foundCase.clientName,
      caseType: foundCase.caseType,
      owner: foundCase.owner,
      deadline: foundCase.deadline,
      documentsCount: foundCase.documentsCount,
    });

    return tx.case.findUnique({
      where: { id: caseId },
      include: { findings: true },
    });
  });
}

export async function reevaluateFirmCases(firmId: string) {
  const caseIds = await prisma.case.findMany({
    where: { firmId },
    select: { id: true },
  });

  for (const c of caseIds) {
    await reevaluateCase(c.id);
  }

  return {
    evaluated: caseIds.length,
  };
}

export async function getRiskTrends(params: { firmId?: string; days?: number }) {
  const days = Math.min(Math.max(params.days ?? 90, 7), 365);
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.case.findMany({
    where: {
      createdAt: { gte: from },
      ...(params.firmId ? { firmId: params.firmId } : {}),
    },
    select: {
      createdAt: true,
      riskLevel: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const buckets = new Map<
    string,
    {
      weekStart: string;
      totalCases: number;
      highRiskCases: number;
      highRiskPercent: number;
    }
  >();

  for (const row of rows) {
    const weekStartDate = new Date(row.createdAt);
    const day = weekStartDate.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    weekStartDate.setUTCDate(weekStartDate.getUTCDate() + diffToMonday);
    weekStartDate.setUTCHours(0, 0, 0, 0);

    const key = weekStartDate.toISOString();
    const bucket =
      buckets.get(key) ??
      {
        weekStart: key,
        totalCases: 0,
        highRiskCases: 0,
        highRiskPercent: 0,
      };

    bucket.totalCases += 1;
    if (row.riskLevel === "HIGH" || row.riskLevel === "CRITICAL") {
      bucket.highRiskCases += 1;
    }
    buckets.set(key, bucket);
  }

  const trend = Array.from(buckets.values()).map((bucket) => ({
    ...bucket,
    highRiskPercent:
      bucket.totalCases === 0
        ? 0
        : Math.round((bucket.highRiskCases / bucket.totalCases) * 100),
  }));

  const latest = trend.length > 0 ? trend[trend.length - 1] : undefined;
  const previous = trend.length > 1 ? trend[trend.length - 2] : undefined;
  const highRiskDeltaPercent =
    latest && previous
      ? latest.highRiskPercent - previous.highRiskPercent
      : 0;

  return {
    windowDays: days,
    totalBuckets: trend.length,
    highRiskDeltaPercent,
    trend,
  };
}
