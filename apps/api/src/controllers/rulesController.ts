import { RuleField, RuleOperator, Severity } from "@prisma/client";
import { Request, Response } from "express";
import { reevaluateFirmCases } from "../services/caseService";
import {
  createRule,
  listRules,
  toggleRule,
  updateRule,
} from "../services/ruleService";
import { badRequest, serverError } from "../utils/http";

function isSeverity(value: string): value is Severity {
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value);
}

function isRuleField(value: string): value is RuleField {
  return ["DOCUMENTS_COUNT", "DEADLINE_IS_PAST", "CASE_TYPE"].includes(value);
}

function isRuleOperator(value: string): value is RuleOperator {
  return ["LT", "LTE", "GT", "GTE", "EQ", "NEQ", "CONTAINS"].includes(value);
}

export async function getRulesHandler(req: Request, res: Response) {
  try {
    const firmId = req.query.firmId as string | undefined;
    if (!firmId) {
      return badRequest(res, "firmId query parameter is required");
    }

    const rules = await listRules(firmId);
    return res.json(rules);
  } catch (error) {
    return serverError(res, error);
  }
}

export async function createRuleHandler(req: Request, res: Response) {
  try {
    const {
      firmId,
      code,
      name,
      description,
      severity,
      weight,
      enabled,
      conditions,
    } = req.body ?? {};

    if (!firmId || !code || !name || !description || severity == null || weight == null) {
      return badRequest(
        res,
        "firmId, code, name, description, severity and weight are required"
      );
    }

    if (!isSeverity(String(severity))) {
      return badRequest(res, "severity must be one of LOW|MEDIUM|HIGH|CRITICAL");
    }

    if (!Array.isArray(conditions) || conditions.length === 0) {
      return badRequest(res, "conditions must be a non-empty array");
    }

    const parsedConditions = conditions.map((condition) => {
      if (
        !condition ||
        !isRuleField(String(condition.field)) ||
        !isRuleOperator(String(condition.operator)) ||
        condition.value == null
      ) {
        throw new Error("Each condition must include valid field/operator/value");
      }

      return {
        field: condition.field as RuleField,
        operator: condition.operator as RuleOperator,
        value: String(condition.value),
      };
    });

    const created = await createRule({
      firmId: String(firmId),
      code: String(code),
      name: String(name),
      description: String(description),
      severity,
      weight: Number(weight),
      enabled: enabled == null ? true : Boolean(enabled),
      conditions: parsedConditions,
    });

    await reevaluateFirmCases(created.firmId);
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}

export async function updateRuleHandler(req: Request, res: Response) {
  try {
    const ruleId = req.params.id;
    if (!ruleId) {
      return badRequest(res, "rule id is required");
    }

    const payload = req.body ?? {};
    const conditions = Array.isArray(payload.conditions)
      ? payload.conditions.map((condition: unknown) => {
          const typed = condition as {
            field: string;
            operator: string;
            value: string;
          };

          if (
            !typed ||
            !isRuleField(typed.field) ||
            !isRuleOperator(typed.operator) ||
            typed.value == null
          ) {
            throw new Error("Invalid condition shape");
          }

          return {
            field: typed.field,
            operator: typed.operator,
            value: String(typed.value),
          };
        })
      : undefined;

    if (payload.severity != null && !isSeverity(String(payload.severity))) {
      return badRequest(res, "severity must be one of LOW|MEDIUM|HIGH|CRITICAL");
    }

    const updated = await updateRule(String(ruleId), {
      name: payload.name,
      description: payload.description,
      severity: payload.severity,
      weight: payload.weight != null ? Number(payload.weight) : undefined,
      enabled: payload.enabled,
      conditions,
    });

    await reevaluateFirmCases(updated.firmId);
    return res.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}

export async function toggleRuleHandler(req: Request, res: Response) {
  try {
    const ruleId = req.params.id;
    if (!ruleId) {
      return badRequest(res, "rule id is required");
    }

    const enabled = Boolean(req.body?.enabled);
    const updated = await toggleRule(String(ruleId), enabled);
    await reevaluateFirmCases(updated.firmId);

    return res.json(updated);
  } catch (error) {
    return serverError(res, error);
  }
}
