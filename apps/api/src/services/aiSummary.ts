import { Severity } from "@prisma/client";

type Finding = {
  severity: Severity;
  message: string;
};

function remediationForSeverity(severity: Severity): string {
  if (severity === Severity.CRITICAL || severity === Severity.HIGH) {
    return "Escalate to compliance lead within 24h and execute remediation immediately.";
  }
  if (severity === Severity.MEDIUM) {
    return "Assign corrective owner and resolve within this filing cycle.";
  }
  return "Monitor and document closure evidence.";
}

export function generateComplianceSummary(params: {
  clientName: string;
  caseType: string;
  findings: Finding[];
  riskLevel: Severity;
}) {
  const { clientName, caseType, findings, riskLevel } = params;

  if (findings.length === 0) {
    return `${clientName} (${caseType}) is currently ${riskLevel.toLowerCase()} risk with no active findings. Continue routine monitoring.`;
  }

  const findingSummary = findings
    .slice(0, 3)
    .map((finding) => finding.message.toLowerCase())
    .join("; ");

  const remediation = remediationForSeverity(riskLevel);

  return `This case is ${riskLevel.toLowerCase()} risk due to ${findingSummary}. Suggested remediation: ${remediation}`;
}
