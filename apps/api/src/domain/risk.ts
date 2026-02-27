import { Severity } from "@prisma/client";

export type WeightedFinding = {
  severity: Severity;
  weight: number;
};

export function resolveRiskLevel(score: number): Severity {
  if (score >= 80) return Severity.CRITICAL;
  if (score >= 50) return Severity.HIGH;
  if (score >= 25) return Severity.MEDIUM;
  return Severity.LOW;
}

export function calculateRiskFromWeights(findings: WeightedFinding[]) {
  const riskScore = Math.min(
    findings.reduce((sum, finding) => sum + Math.max(0, finding.weight), 0),
    100
  );

  return {
    riskScore,
    riskLevel: resolveRiskLevel(riskScore),
  };
}
