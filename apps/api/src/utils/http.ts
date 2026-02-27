import { Response } from "express";

export function badRequest(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

export function serverError(res: Response, error: unknown) {
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
}
