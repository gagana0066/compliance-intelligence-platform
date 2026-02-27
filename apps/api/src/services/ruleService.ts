import {
  Prisma,
  RuleField,
  RuleOperator,
  Severity,
  UserRole,
} from "@prisma/client";
import { prisma } from "../lib/prisma";

export type CreateRuleInput = {
  firmId: string;
  code: string;
  name: string;
  description: string;
  severity: Severity;
  weight: number;
  enabled?: boolean;
  conditions: {
    field: RuleField;
    operator: RuleOperator;
    value: string;
  }[];
};

const baselineRules: Omit<CreateRuleInput, "firmId">[] = [
  {
    code: "DOC_MIN",
    name: "Minimum Documents",
    description: "Less than 3 required documents uploaded",
    severity: Severity.MEDIUM,
    weight: 25,
    enabled: true,
    conditions: [
      {
        field: RuleField.DOCUMENTS_COUNT,
        operator: RuleOperator.LT,
        value: "3",
      },
    ],
  },
  {
    code: "DEADLINE_BREACH",
    name: "Deadline Breach",
    description: "Filing deadline has passed",
    severity: Severity.HIGH,
    weight: 50,
    enabled: true,
    conditions: [
      {
        field: RuleField.DEADLINE_IS_PAST,
        operator: RuleOperator.EQ,
        value: "true",
      },
    ],
  },
];

export async function ensureDefaultFirmAndAdmin() {
  const firm = await prisma.firm.upsert({
    where: { slug: "default-law-firm" },
    create: {
      id: "default-firm",
      name: "Default Law Firm",
      slug: "default-law-firm",
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: "admin@defaultlawfirm.com" },
    create: {
      email: "admin@defaultlawfirm.com",
      fullName: "Default Admin",
      role: UserRole.ADMIN,
      firmId: firm.id,
    },
    update: {},
  });

  await ensureBaselineRulesForFirm(firm.id);
  return firm;
}

export async function ensureBaselineRulesForFirm(firmId: string) {
  for (const rule of baselineRules) {
    await prisma.complianceRule.upsert({
      where: {
        firmId_code: {
          firmId,
          code: rule.code,
        },
      },
      create: {
        firmId,
        code: rule.code,
        name: rule.name,
        description: rule.description,
        severity: rule.severity,
        weight: rule.weight,
        enabled: rule.enabled,
        conditions: {
          create: rule.conditions,
        },
      },
      update: {
        name: rule.name,
        description: rule.description,
      },
    });
  }
}

export async function listRules(firmId: string) {
  return prisma.complianceRule.findMany({
    where: { firmId },
    include: { conditions: true },
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createRule(input: CreateRuleInput) {
  return prisma.complianceRule.create({
    data: {
      firmId: input.firmId,
      code: input.code,
      name: input.name,
      description: input.description,
      severity: input.severity,
      weight: input.weight,
      enabled: input.enabled ?? true,
      conditions: {
        create: input.conditions,
      },
    },
    include: { conditions: true },
  });
}

export async function updateRule(
  ruleId: string,
  data: {
    name?: string;
    description?: string;
    severity?: Severity;
    weight?: number;
    enabled?: boolean;
    conditions?: {
      field: RuleField;
      operator: RuleOperator;
      value: string;
    }[];
  }
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (data.conditions) {
      await tx.ruleCondition.deleteMany({ where: { ruleId } });
    }

    return tx.complianceRule.update({
      where: { id: ruleId },
      data: {
        name: data.name,
        description: data.description,
        severity: data.severity,
        weight: data.weight,
        enabled: data.enabled,
        conditions: data.conditions
          ? {
              create: data.conditions,
            }
          : undefined,
      },
      include: { conditions: true },
    });
  });
}

export async function toggleRule(ruleId: string, enabled: boolean) {
  return prisma.complianceRule.update({
    where: { id: ruleId },
    data: { enabled },
    include: { conditions: true },
  });
}
