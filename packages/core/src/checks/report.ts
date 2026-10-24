// SPDX-License-Identifier: Apache-2.0
import type { Lang } from "../i18n";

/**
 * What `specty check` found (ADR 0012), and how it prints it: only the failures, grouped by
 * check, then one summary line, so an agent spends few tokens on it. Pure.
 */

/** Which files a run looks at: changed against the target branch, staged, or all of them. */
export type CheckMode = "changed" | "staged" | "all";

export interface Finding {
  readonly path?: string;
  readonly line?: number;
  readonly message: string;
  /** `warning` keeps a finding below the bar, even in a check of level error. */
  readonly severity?: "error" | "warning";
}

export interface CheckResult {
  readonly id: string;
  /** The configured level; checks set to `off` do not run and leave no result. */
  readonly level: "error" | "warn";
  readonly findings: readonly Finding[];
  /** Why the check did not run, such as a missing tool. */
  readonly skipped?: string;
}

export interface CheckReport {
  readonly mode: CheckMode;
  readonly results: readonly CheckResult[];
}

export type CheckStatus = "passed" | "failed" | "warned" | "skipped";

export function statusOf(result: CheckResult): CheckStatus {
  if (result.skipped !== undefined) return "skipped";
  const failing = result.findings.some((finding) => (finding.severity ?? "error") === "error");
  if (result.level === "error" && failing) return "failed";
  return result.findings.length > 0 ? "warned" : "passed";
}

/** 1 when an error-level check failed; warnings never fail the run. */
export function reportExitCode(report: CheckReport): 0 | 1 {
  return report.results.some((result) => statusOf(result) === "failed") ? 1 : 0;
}

const WORDS: Readonly<Record<Lang, Readonly<Record<CheckStatus | "more", string>>>> = {
  es: { passed: "OK", failed: "FALLA", warned: "AVISO", skipped: "SIN EJECUTAR", more: "más" },
  en: { passed: "OK", failed: "FAIL", warned: "WARN", skipped: "NOT RUN", more: "more" },
};

export interface RenderOptions {
  readonly lang: Lang;
  /** Every finding, the checks that passed and why a check did not run. */
  readonly verbose: boolean;
  /** Findings shown per check, without `verbose`. */
  readonly maxFindings: number;
}

export function renderReport(report: CheckReport, options: RenderOptions): string {
  const words = WORDS[options.lang];
  const and = options.lang === "es" ? "y" : "and";
  const lines = report.results.flatMap((result): string[] => {
    const status = statusOf(result);
    if (status === "passed") return options.verbose ? [`${words.passed} ${result.id}`] : [];
    if (status === "skipped") {
      return options.verbose ? [`${words.skipped} ${result.id}: ${result.skipped ?? ""}`] : [];
    }
    const shown = options.verbose ? result.findings : result.findings.slice(0, options.maxFindings);
    const hidden = result.findings.length - shown.length;
    return [
      `${words[status]} ${result.id}`,
      ...shown.map((finding) => `  ${findingLine(finding)}`),
      ...(hidden > 0 ? [`  … ${and} ${hidden} ${words.more}`] : []),
    ];
  });
  return [...lines, summaryLine(report, options.lang)].join("\n");
}

/** `OK 9/11 · FALLA: layers, max-lines · AVISO: todo · SIN EJECUTAR: secrets`. */
export function summaryLine(report: CheckReport, lang: Lang): string {
  const words = WORDS[lang];
  const ids = (status: CheckStatus) =>
    report.results.filter((result) => statusOf(result) === status).map((result) => result.id);
  const passed = ids("passed").length;
  const groups = (["failed", "warned", "skipped"] as const).flatMap((status) => {
    const listed = ids(status);
    return listed.length === 0 ? [] : [`${words[status]}: ${listed.join(", ")}`];
  });
  return [`${words.passed} ${passed}/${report.results.length}`, ...groups].join(" · ");
}

/** The report for CI: every check with its status, the summary and the exit code. */
export function reportJson(report: CheckReport) {
  const ids = (status: CheckStatus) =>
    report.results.filter((result) => statusOf(result) === status).map((result) => result.id);
  return {
    mode: report.mode,
    checks: report.results.map((result) => ({
      id: result.id,
      level: result.level,
      status: statusOf(result),
      findings: result.findings,
      ...(result.skipped !== undefined ? { reason: result.skipped } : {}),
    })),
    summary: {
      passed: ids("passed").length,
      total: report.results.length,
      failed: ids("failed"),
      warned: ids("warned"),
      skipped: ids("skipped"),
    },
    exitCode: reportExitCode(report),
  };
}

function findingLine(finding: Finding): string {
  if (finding.path === undefined) return finding.message;
  const at = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
  return `${at} ${finding.message}`;
}
