import { CaseDashboard } from "./components/case-dashboard";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type CaseDto = {
  id: string;
  clientName: string;
  caseType: string;
  owner: string;
  deadline: string;
  riskScore: number;
  riskLevel: Severity;
  aiSummary?: string | null;
  firm?: {
    id: string;
    name: string;
    slug: string;
  };
  findings: {
    id: string;
    ruleId: string;
    severity: Severity;
    message: string;
  }[];
};

type TrendPoint = {
  weekStart: string;
  totalCases: number;
  highRiskCases: number;
  highRiskPercent: number;
};

type TrendDto = {
  windowDays: number;
  totalBuckets: number;
  highRiskDeltaPercent: number;
  trend: TrendPoint[];
};

type RuleDto = {
  id: string;
  firmId: string;
  code: string;
  name: string;
  description: string;
  enabled: boolean;
  weight: number;
  severity: Severity;
  conditions: {
    id: string;
    field: "DOCUMENTS_COUNT" | "DEADLINE_IS_PAST" | "CASE_TYPE";
    operator: "LT" | "LTE" | "GT" | "GTE" | "EQ" | "NEQ" | "CONTAINS";
    value: string;
  }[];
};

async function getCases(): Promise<CaseDto[]> {
  const response = await fetch("http://localhost:4000/cases", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch cases (${response.status})`);
  }

  return response.json();
}

async function getRiskTrends(firmId: string): Promise<TrendDto | null> {
  const response = await fetch(
    `http://localhost:4000/analytics/risk-trends?firmId=${firmId}&days=120`,
    {
      cache: "no-store",
    }
  );

  if (!response.ok) return null;
  return response.json();
}

async function getRules(firmId: string): Promise<RuleDto[]> {
  const response = await fetch(`http://localhost:4000/rules?firmId=${firmId}`, {
    cache: "no-store",
  });
  if (!response.ok) return [];
  return response.json();
}

export default async function Home() {
  const nowIso = new Date().toISOString();
  const defaultFirmId = "default-firm";
  const result = await getCases()
    .then((cases) => ({ cases, errorMessage: "" }))
    .catch((error: unknown) => ({
      cases: [] as CaseDto[],
      errorMessage:
        error instanceof Error ? error.message : "Unknown connection error",
    }));

  if (!result.errorMessage) {
    const [trends, rules] = await Promise.all([
      getRiskTrends(defaultFirmId),
      getRules(defaultFirmId),
    ]);

    return (
      <CaseDashboard
        cases={result.cases}
        trends={trends}
        rules={rules}
        nowIso={nowIso}
      />
    );
  }

  return (
    <main className="dashboard-bg flex min-h-screen items-center justify-center px-4">
      <div className="max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--moss-500)]">
          Compliance Intelligence Platform
        </p>
        <h1 className="text-2xl font-bold text-[var(--forest-700)]">
          Dashboard Unavailable
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Could not load cases from the API. Confirm backend is running at
          <span className="mx-1 font-mono text-[var(--forest-700)]">
            http://localhost:4000
          </span>
          and refresh.
        </p>
        <p className="mt-4 rounded-lg bg-white px-3 py-2 font-mono text-xs text-[var(--danger)]">
          {result.errorMessage}
        </p>
      </div>
    </main>
  );
}
