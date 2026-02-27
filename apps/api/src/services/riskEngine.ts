type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const severityWeights: Record<Severity, number> = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 50,
  CRITICAL: 75,
};

export function calculateRisk(findings: { severity: Severity }[]) {
  let score = findings.reduce(
    (sum, f) => sum + severityWeights[f.severity],
    0
  );

  score = Math.min(score, 100);

  let level: Severity;

  if (score >= 80) level = "CRITICAL";
  else if (score >= 50) level = "HIGH";
  else if (score >= 25) level = "MEDIUM";
  else level = "LOW";

  return { riskScore: score, riskLevel: level };
}