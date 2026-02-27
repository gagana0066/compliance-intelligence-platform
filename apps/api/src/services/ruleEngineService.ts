import {
  ComplianceRule,
  Prisma,
  RuleCondition,
  RuleField,
  RuleOperator,
} from "@prisma/client";
import { prisma } from "../lib/prisma";

export type RuleEvaluableCase = {
  clientName: string;
  caseType: string;
  owner: string;
  deadline: Date;
  documentsCount: number;
};

type RuleWithConditions = ComplianceRule & {
  conditions: RuleCondition[];
};

export type EvaluatedFinding = {
  ruleId: string;
  ruleRefId: string;
  severity: ComplianceRule["severity"];
  message: string;
  weight: number;
};

export async function getEnabledRulesForFirm(firmId: string) {
  return prisma.complianceRule.findMany({
    where: { firmId, enabled: true },
    include: { conditions: true },
  });
}

function compareNumeric(left: number, operator: RuleOperator, right: number) {
  if (operator === RuleOperator.LT) return left < right;
  if (operator === RuleOperator.LTE) return left <= right;
  if (operator === RuleOperator.GT) return left > right;
  if (operator === RuleOperator.GTE) return left >= right;
  if (operator === RuleOperator.EQ) return left === right;
  if (operator === RuleOperator.NEQ) return left !== right;
  return false;
}

function compareText(left: string, operator: RuleOperator, right: string) {
  const normLeft = left.toLowerCase();
  const normRight = right.toLowerCase();

  if (operator === RuleOperator.EQ) return normLeft === normRight;
  if (operator === RuleOperator.NEQ) return normLeft !== normRight;
  if (operator === RuleOperator.CONTAINS) return normLeft.includes(normRight);
  return false;
}

function evaluateCondition(ruleCase: RuleEvaluableCase, condition: RuleCondition) {
  if (condition.field === RuleField.DOCUMENTS_COUNT) {
    const target = Number(condition.value);
    if (Number.isNaN(target)) return false;
    return compareNumeric(ruleCase.documentsCount, condition.operator, target);
  }

  if (condition.field === RuleField.DEADLINE_IS_PAST) {
    const isPastDue = ruleCase.deadline.getTime() < Date.now();
    const target = condition.value.toLowerCase() === "true";
    return condition.operator === RuleOperator.NEQ
      ? isPastDue !== target
      : isPastDue === target;
  }

  if (condition.field === RuleField.CASE_TYPE) {
    return compareText(ruleCase.caseType, condition.operator, condition.value);
  }

  return false;
}

function shouldTriggerRule(ruleCase: RuleEvaluableCase, rule: RuleWithConditions) {
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((condition) => evaluateCondition(ruleCase, condition));
}

export async function evaluateRulesForCase(params: {
  firmId: string;
  ruleCase: RuleEvaluableCase;
  tx?: Prisma.TransactionClient;
}) {
  const { firmId, ruleCase, tx } = params;
  const db = tx ?? prisma;
  const rules = await db.complianceRule.findMany({
    where: { firmId, enabled: true },
    include: { conditions: true },
  });

  return rules
    .filter((rule) => shouldTriggerRule(ruleCase, rule))
    .map((rule): EvaluatedFinding => ({
      ruleId: rule.code,
      ruleRefId: rule.id,
      severity: rule.severity,
      message: rule.description,
      weight: rule.weight,
    }));
}
