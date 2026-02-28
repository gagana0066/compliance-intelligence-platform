"use client";

import { useMemo, useState } from "react";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type RuleField = "DOCUMENTS_COUNT" | "DEADLINE_IS_PAST" | "CASE_TYPE";
type RuleOperator = "LT" | "LTE" | "GT" | "GTE" | "EQ" | "NEQ" | "CONTAINS";

type Finding = {
  id: string;
  ruleId: string;
  severity: Severity;
  message: string;
};

type ComplianceCase = {
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
  findings: Finding[];
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
} | null;

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
    field: RuleField;
    operator: RuleOperator;
    value: string;
  }[];
};

const riskOrder: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const riskBadgeStyles: Record<Severity, string> = {
  LOW: "bg-[var(--ok)] text-white",
  MEDIUM: "bg-[var(--warn)] text-white",
  HIGH: "bg-[var(--danger)] text-white",
  CRITICAL: "bg-[var(--pine-800)] text-[var(--stone-100)]",
};

const findingStyles: Record<Severity, string> = {
  LOW: "bg-[#d8eadf] border-[#6ea982]",
  MEDIUM: "bg-[#f1e2c9] border-[#a9823f]",
  HIGH: "bg-[#f2d4d4] border-[#b85c5c]",
  CRITICAL: "bg-[#d0ded8] border-[#436d5d]",
};

type Props = {
  cases: ComplianceCase[];
  trends: TrendDto;
  rules: RuleDto[];
  nowIso: string;
};

export function CaseDashboard({ cases, trends, rules, nowIso }: Props) {
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<Severity | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"RISK_DESC" | "DEADLINE_ASC" | "NEWEST">(
    "RISK_DESC"
  );
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [localRules, setLocalRules] = useState<RuleDto[]>(rules);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyRuleId, setBusyRuleId] = useState("");
  const [editingRuleId, setEditingRuleId] = useState("");
  const [newRule, setNewRule] = useState({
    code: "",
    name: "",
    description: "",
    severity: "MEDIUM" as Severity,
    weight: 25,
    field: "DOCUMENTS_COUNT" as RuleField,
    operator: "LT" as RuleOperator,
    value: "3",
  });
  const [editRule, setEditRule] = useState({
    name: "",
    description: "",
    severity: "MEDIUM" as Severity,
    weight: 25,
    field: "DOCUMENTS_COUNT" as RuleField,
    operator: "LT" as RuleOperator,
    value: "3",
  });
  const nowTime = new Date(nowIso).getTime();
  const firmId =
    cases.find((c) => c.firm?.id)?.firm?.id ??
    rules[0]?.firmId ??
    "default-firm";

  const filteredCases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    let next = cases.filter((c) => {
      const inSearch =
        normalizedQuery.length === 0 ||
        c.clientName.toLowerCase().includes(normalizedQuery) ||
        c.owner.toLowerCase().includes(normalizedQuery) ||
        c.caseType.toLowerCase().includes(normalizedQuery);

      const inRisk = riskFilter === "ALL" || c.riskLevel === riskFilter;
      const isOverdue = new Date(c.deadline).getTime() < nowTime;
      const inOverdue = !showOverdueOnly || isOverdue;

      return inSearch && inRisk && inOverdue;
    });

    next = next.sort((a, b) => {
      if (sortBy === "RISK_DESC") {
        return b.riskScore - a.riskScore;
      }
      if (sortBy === "DEADLINE_ASC") {
        return (
          new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
        );
      }
      return (
        new Date(b.deadline).getTime() - new Date(a.deadline).getTime()
      );
    });

    return next;
  }, [cases, nowTime, query, riskFilter, showOverdueOnly, sortBy]);

  const summary = useMemo(() => {
    const totalCases = cases.length;
    const highRiskCases = cases.filter(
      (c) => c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL"
    ).length;
    const criticalCases = cases.filter((c) => c.riskLevel === "CRITICAL").length;
    const overdueCases = cases.filter(
      (c) => new Date(c.deadline).getTime() < nowTime
    ).length;
    const avgRisk =
      totalCases > 0
        ? Math.round(
            cases.reduce((sum, c) => sum + c.riskScore, 0) / totalCases
          )
        : 0;
    const findingCount = cases.reduce((sum, c) => sum + c.findings.length, 0);
    const byLevel = {
      LOW: cases.filter((c) => c.riskLevel === "LOW").length,
      MEDIUM: cases.filter((c) => c.riskLevel === "MEDIUM").length,
      HIGH: cases.filter((c) => c.riskLevel === "HIGH").length,
      CRITICAL: cases.filter((c) => c.riskLevel === "CRITICAL").length,
    };

    return {
      totalCases,
      highRiskCases,
      criticalCases,
      overdueCases,
      avgRisk,
      findingCount,
      byLevel,
    };
  }, [cases, nowTime]);

  const activeRules = localRules.filter((rule) => rule.enabled);
  const highestWeightRule = [...activeRules].sort(
    (a, b) => b.weight - a.weight
  )[0];
  const activeRulesWeight = activeRules.reduce((sum, rule) => sum + rule.weight, 0);
  const tenantName =
    cases.find((c) => c.firm?.name)?.firm?.name ?? "Default Law Firm";

  async function toggleRule(rule: RuleDto) {
    try {
      setBusyRuleId(rule.id);
      setActionError("");
      setActionMessage("");
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rules/${rule.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to toggle rule");
      }

      const updated = (await response.json()) as RuleDto;
      setLocalRules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setActionMessage(`Rule ${updated.code} is now ${updated.enabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to toggle rule");
    } finally {
      setBusyRuleId("");
    }
  }

  function beginEdit(rule: RuleDto) {
    setEditingRuleId(rule.id);
    setEditRule({
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      weight: rule.weight,
      field: rule.conditions[0]?.field ?? "DOCUMENTS_COUNT",
      operator: rule.conditions[0]?.operator ?? "LT",
      value: rule.conditions[0]?.value ?? "3",
    });
    setActionError("");
    setActionMessage("");
  }

  async function saveEdit(ruleId: string) {
    try {
      setBusyRuleId(ruleId);
      setActionError("");
      setActionMessage("");

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editRule.name.trim(),
          description: editRule.description.trim(),
          severity: editRule.severity,
          weight: Number(editRule.weight),
          conditions: [
            {
              field: editRule.field,
              operator: editRule.operator,
              value: String(editRule.value),
            },
          ],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to update rule");
      }

      const updated = (await response.json()) as RuleDto;
      setLocalRules((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setEditingRuleId("");
      setActionMessage(`Updated ${updated.code}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to update rule");
    } finally {
      setBusyRuleId("");
    }
  }

  async function createRule() {
    try {
      setBusyRuleId("create");
      setActionError("");
      setActionMessage("");

      if (!newRule.code.trim() || !newRule.name.trim() || !newRule.description.trim()) {
        throw new Error("code, name and description are required");
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmId,
          code: newRule.code.trim().toUpperCase(),
          name: newRule.name.trim(),
          description: newRule.description.trim(),
          severity: newRule.severity,
          weight: Number(newRule.weight),
          enabled: true,
          conditions: [
            {
              field: newRule.field,
              operator: newRule.operator,
              value: String(newRule.value),
            },
          ],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to create rule");
      }

      const created = (await response.json()) as RuleDto;
      setLocalRules((current) => [created, ...current]);
      setNewRule({
        code: "",
        name: "",
        description: "",
        severity: "MEDIUM",
        weight: 25,
        field: "DOCUMENTS_COUNT",
        operator: "LT",
        value: "3",
      });
      setActionMessage(`Created rule ${created.code}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to create rule");
    } finally {
      setBusyRuleId("");
    }
  }

  return (
    <main className="dashboard-bg">
      <section className="mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8">
        <header className="mb-8 card-enter">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--moss-500)]">
            Compliance Intelligence Platform
          </p>
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-extrabold text-[var(--forest-700)] sm:text-4xl">
                Case Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
                Monitor case risk, prioritize deadlines, and inspect findings
                from a single operational view.
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--moss-500)]">
                Tenant: {tenantName}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right shadow-sm">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Visible Cases
              </p>
              <p className="text-2xl font-bold text-[var(--forest-700)]">
                {filteredCases.length}
              </p>
            </div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total Cases"
            value={summary.totalCases}
            tone="neutral"
            className="card-enter stagger-1"
          />
          <MetricCard
            label="High Risk Cases"
            value={summary.highRiskCases}
            tone="danger"
            className="card-enter stagger-2"
          />
          <MetricCard
            label="Critical Cases"
            value={summary.criticalCases}
            tone="critical"
            className="card-enter stagger-3"
          />
          <MetricCard
            label="Average Risk Score"
            value={`${summary.avgRisk}/100`}
            tone="primary"
            className="card-enter"
          />
        </section>

        <section className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm card-enter">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Search
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Client, owner, or case type"
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--forest-700)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Risk Level
              </span>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as Severity | "ALL")}
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--forest-700)]"
              >
                <option value="ALL">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Sort
              </span>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "RISK_DESC" | "DEADLINE_ASC" | "NEWEST"
                  )
                }
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--forest-700)]"
              >
                <option value="RISK_DESC">Risk (High to Low)</option>
                <option value="DEADLINE_ASC">Deadline (Nearest First)</option>
                <option value="NEWEST">Deadline (Latest First)</option>
              </select>
            </label>

            <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--muted)]">
              <input
                type="checkbox"
                checked={showOverdueOnly}
                onChange={(e) => setShowOverdueOnly(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--forest-700)]"
              />
              Show overdue only
            </label>
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm card-enter">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--forest-700)]">
                Rules Console
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Database-driven policy rules currently active for this tenant.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {localRules.length} total
            </span>
          </div>
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Create Rule
            </p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <input
                value={newRule.code}
                onChange={(e) => setNewRule((r) => ({ ...r, code: e.target.value }))}
                placeholder="Code (e.g. CASE_TYPE_MA)"
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              />
              <input
                value={newRule.name}
                onChange={(e) => setNewRule((r) => ({ ...r, name: e.target.value }))}
                placeholder="Rule name"
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              />
              <input
                value={newRule.description}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, description: e.target.value }))
                }
                placeholder="Rule message / remediation text"
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm md:col-span-2"
              />
              <select
                value={newRule.severity}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, severity: e.target.value as Severity }))
                }
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
              <input
                value={newRule.weight}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, weight: Number(e.target.value) || 0 }))
                }
                placeholder="Weight"
                type="number"
                min={0}
                max={100}
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              />
              <select
                value={newRule.field}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, field: e.target.value as RuleField }))
                }
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              >
                <option value="DOCUMENTS_COUNT">DOCUMENTS_COUNT</option>
                <option value="DEADLINE_IS_PAST">DEADLINE_IS_PAST</option>
                <option value="CASE_TYPE">CASE_TYPE</option>
              </select>
              <select
                value={newRule.operator}
                onChange={(e) =>
                  setNewRule((r) => ({ ...r, operator: e.target.value as RuleOperator }))
                }
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              >
                <option value="LT">LT</option>
                <option value="LTE">LTE</option>
                <option value="GT">GT</option>
                <option value="GTE">GTE</option>
                <option value="EQ">EQ</option>
                <option value="NEQ">NEQ</option>
                <option value="CONTAINS">CONTAINS</option>
              </select>
              <input
                value={newRule.value}
                onChange={(e) => setNewRule((r) => ({ ...r, value: e.target.value }))}
                placeholder="Condition value"
                className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
              />
              <button
                type="button"
                onClick={createRule}
                disabled={busyRuleId === "create"}
                className="rounded-lg bg-[var(--forest-700)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busyRuleId === "create" ? "Creating..." : "Create Rule"}
              </button>
            </div>
          </div>
          {actionError && (
            <p className="mb-2 rounded-lg bg-[#f2d4d4] px-3 py-2 text-sm text-[#8a2020]">
              {actionError}
            </p>
          )}
          {actionMessage && (
            <p className="mb-2 rounded-lg bg-[#d8eadf] px-3 py-2 text-sm text-[#1f6a3e]">
              {actionMessage}
            </p>
          )}
          <div className="space-y-2">
            {localRules.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                No rules found for this firm yet.
              </p>
            )}
            {localRules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[var(--forest-700)]">
                      {rule.code} | {rule.name}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{rule.description}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Severity: {rule.severity} | Weight: {rule.weight} | Condition:{" "}
                      {rule.conditions[0]?.field ?? "-"} {rule.conditions[0]?.operator ?? "-"}{" "}
                      {rule.conditions[0]?.value ?? "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(rule)}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--muted)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule)}
                      disabled={busyRuleId === rule.id}
                      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--muted)] disabled:opacity-60"
                    >
                      {busyRuleId === rule.id
                        ? "Saving..."
                        : rule.enabled
                        ? "Disable"
                        : "Enable"}
                    </button>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        rule.enabled
                          ? "bg-[#d8eadf] text-[#1f6a3e]"
                          : "bg-[#f2d4d4] text-[#8a2020]"
                      }`}
                    >
                      {rule.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                </div>
                {editingRuleId === rule.id && (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      value={editRule.name}
                      onChange={(e) =>
                        setEditRule((current) => ({ ...current, name: e.target.value }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    />
                    <input
                      value={editRule.description}
                      onChange={(e) =>
                        setEditRule((current) => ({
                          ...current,
                          description: e.target.value,
                        }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    />
                    <select
                      value={editRule.severity}
                      onChange={(e) =>
                        setEditRule((current) => ({
                          ...current,
                          severity: e.target.value as Severity,
                        }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                    <input
                      value={editRule.weight}
                      onChange={(e) =>
                        setEditRule((current) => ({
                          ...current,
                          weight: Number(e.target.value) || 0,
                        }))
                      }
                      type="number"
                      min={0}
                      max={100}
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    />
                    <select
                      value={editRule.field}
                      onChange={(e) =>
                        setEditRule((current) => ({
                          ...current,
                          field: e.target.value as RuleField,
                        }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    >
                      <option value="DOCUMENTS_COUNT">DOCUMENTS_COUNT</option>
                      <option value="DEADLINE_IS_PAST">DEADLINE_IS_PAST</option>
                      <option value="CASE_TYPE">CASE_TYPE</option>
                    </select>
                    <select
                      value={editRule.operator}
                      onChange={(e) =>
                        setEditRule((current) => ({
                          ...current,
                          operator: e.target.value as RuleOperator,
                        }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    >
                      <option value="LT">LT</option>
                      <option value="LTE">LTE</option>
                      <option value="GT">GT</option>
                      <option value="GTE">GTE</option>
                      <option value="EQ">EQ</option>
                      <option value="NEQ">NEQ</option>
                      <option value="CONTAINS">CONTAINS</option>
                    </select>
                    <input
                      value={editRule.value}
                      onChange={(e) =>
                        setEditRule((current) => ({ ...current, value: e.target.value }))
                      }
                      className="rounded-lg border border-[var(--border)] px-2 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(rule.id)}
                        disabled={busyRuleId === rule.id}
                        className="rounded-lg bg-[var(--forest-700)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {busyRuleId === rule.id ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRuleId("")}
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm card-enter">
            <h2 className="text-lg font-bold text-[var(--forest-700)]">
              Risk Distribution
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Current portfolio split by risk level.
            </p>
            <div className="mt-5 space-y-4">
              {(Object.keys(summary.byLevel) as Severity[]).map((level) => {
                const count = summary.byLevel[level];
                const pct =
                  summary.totalCases > 0
                    ? Math.round((count / summary.totalCases) * 100)
                    : 0;
                return (
                  <div key={level}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-[var(--foreground)]">
                        {level}
                      </span>
                      <span className="font-mono text-[var(--muted)]">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface-strong)]">
                      <div
                        className={`h-2 rounded-full ${
                          level === "LOW"
                            ? "bg-[var(--ok)]"
                            : level === "MEDIUM"
                            ? "bg-[var(--warn)]"
                            : level === "HIGH"
                            ? "bg-[var(--danger)]"
                            : "bg-[var(--pine-800)]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm card-enter">
            <h2 className="text-lg font-bold text-[var(--forest-700)]">
              Operational Signals
            </h2>
            <div className="mt-5 space-y-3 text-sm">
              <SignalRow label="Overdue Cases" value={summary.overdueCases} />
              <SignalRow label="Total Findings" value={summary.findingCount} />
              <SignalRow
                label="High Priority Cases"
                value={summary.highRiskCases}
              />
              <SignalRow label="Active Rules" value={activeRules.length} />
              <SignalRow label="Rule Weight Pool" value={activeRulesWeight} />
            </div>
            {highestWeightRule && (
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-white px-3 py-3">
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                  Strongest Rule
                </p>
                <p className="mt-1 text-sm font-bold text-[var(--forest-700)]">
                  {highestWeightRule.code} ({highestWeightRule.weight})
                </p>
                <p className="text-xs text-[var(--muted)]">{highestWeightRule.name}</p>
              </div>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm card-enter">
          <h2 className="text-lg font-bold text-[var(--forest-700)]">
            Risk Trend Analytics
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Weekly trend of total cases and high-risk density.
          </p>
          {trends && trends.trend.length > 0 ? (
            <div className="mt-5">
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <SignalRow label="Trend Window (Days)" value={trends.windowDays} />
                <SignalRow label="Tracked Weeks" value={trends.totalBuckets} />
                <SignalRow
                  label="High-Risk Delta %"
                  value={trends.highRiskDeltaPercent}
                />
              </div>
              <div className="space-y-2">
                {trends.trend.map((point) => (
                  <div key={point.weekStart} className="rounded-xl bg-white px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>
                        Week of {new Date(point.weekStart).toLocaleDateString()}
                      </span>
                      <span>
                        {point.highRiskCases}/{point.totalCases} high-risk
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface-strong)]">
                      <div
                        className="h-2 rounded-full bg-[var(--pine-800)]"
                        style={{ width: `${point.highRiskPercent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Not enough data yet to render weekly trend analytics.
            </p>
          )}
        </section>

        <section className="space-y-5">
          {filteredCases.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              No matching cases found. Change the filters or search query.
            </div>
          )}

          {filteredCases.map((c, index) => {
            const deadline = new Date(c.deadline);
            const isOverdue = deadline.getTime() < nowTime;
            const highFindings = c.findings.filter(
              (f) => riskOrder[f.severity] >= riskOrder.HIGH
            ).length;
            return (
              <article
                key={c.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm card-enter"
                style={{ animationDelay: `${Math.min(index * 90, 360)}ms` }}
              >
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-[var(--forest-700)]">
                      {c.clientName}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {c.caseType} | Owner: {c.owner}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Due {deadline.toLocaleDateString()}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${riskBadgeStyles[c.riskLevel]}`}
                    >
                      {c.riskLevel}
                    </span>
                    {isOverdue && (
                      <span className="rounded-full bg-[#f6cccc] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#8a2020]">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[var(--muted)]">
                      Risk Score
                    </span>
                    <span className="font-mono text-[var(--foreground)]">
                      {c.riskScore}/100
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-[var(--surface-strong)]">
                    <div
                      className="h-2.5 rounded-full bg-[var(--moss-500)] transition-all"
                      style={{ width: `${c.riskScore}%` }}
                    />
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-[var(--muted)]">
                    Findings: {c.findings.length}
                  </span>
                  <span className="rounded-lg bg-white px-2.5 py-1 font-semibold text-[var(--muted)]">
                    High/Critical Findings: {highFindings}
                  </span>
                </div>

                {c.aiSummary && (
                  <div className="mb-4 rounded-xl border border-[var(--border)] bg-white px-3 py-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      AI Compliance Summary
                    </p>
                    <p className="text-sm text-[var(--foreground)]">{c.aiSummary}</p>
                  </div>
                )}

                <div className="space-y-2">
                  {c.findings.length === 0 && (
                    <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
                      No findings logged for this case yet.
                    </p>
                  )}
                  {c.findings.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-xl border px-3 py-2 text-sm ${findingStyles[f.severity]}`}
                    >
                      <span className="font-bold">{f.severity}</span> | {f.message}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string | number;
  tone: "neutral" | "danger" | "critical" | "primary";
  className?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "critical"
      ? "text-[var(--pine-800)]"
      : tone === "primary"
      ? "text-[var(--forest-700)]"
      : "text-[var(--foreground)]";

  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm ${className ?? ""}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </p>
      <p className={`mt-3 text-3xl font-extrabold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
      <span className="font-medium text-[var(--muted)]">{label}</span>
      <span className="font-mono text-base font-semibold text-[var(--foreground)]">
        {value}
      </span>
    </div>
  );
}
