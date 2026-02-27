import { Request, Response } from "express";
import {
  createCase,
  getRiskTrends,
  listCases,
  reevaluateFirmCases,
} from "../services/caseService";
import { badRequest, serverError } from "../utils/http";

export async function getCasesHandler(req: Request, res: Response) {
  try {
    const firmId = req.query.firmId as string | undefined;
    const cases = await listCases(firmId);
    return res.json(cases);
  } catch (error) {
    return serverError(res, error);
  }
}

export async function createCaseHandler(req: Request, res: Response) {
  try {
    const { clientName, caseType, owner, deadline, documentsCount, firmId, firmSlug } =
      req.body ?? {};

    if (!clientName || !caseType || !owner || !deadline) {
      return badRequest(
        res,
        "clientName, caseType, owner and deadline are required"
      );
    }

    const parsedDocuments = Number(documentsCount);
    if (Number.isNaN(parsedDocuments)) {
      return badRequest(res, "documentsCount must be a valid number");
    }

    const newCase = await createCase({
      clientName,
      caseType,
      owner,
      deadline,
      documentsCount: parsedDocuments,
      firmId,
      firmSlug,
    });

    return res.status(201).json(newCase);
  } catch (error) {
    if (error instanceof Error) {
      return badRequest(res, error.message);
    }
    return serverError(res, error);
  }
}

export async function getRiskTrendsHandler(req: Request, res: Response) {
  try {
    const firmId = req.query.firmId as string | undefined;
    const daysRaw = req.query.days as string | undefined;
    const days = daysRaw ? Number(daysRaw) : undefined;

    if (daysRaw && Number.isNaN(days)) {
      return badRequest(res, "days must be a number");
    }

    const data = await getRiskTrends({ firmId, days });
    return res.json(data);
  } catch (error) {
    return serverError(res, error);
  }
}

export async function reevaluateFirmHandler(req: Request, res: Response) {
  try {
    const firmId = (req.body?.firmId as string | undefined) ??
      (req.query.firmId as string | undefined);

    if (!firmId) {
      return badRequest(res, "firmId is required");
    }

    const result = await reevaluateFirmCases(firmId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return serverError(res, error);
  }
}
