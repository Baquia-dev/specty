// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CheckReport,
  checkLevel,
  DEFAULT_CONFIG,
  renderReport,
  reportExitCode,
  reportJson,
  resolveConfig,
} from "../../src";

const REPORT: CheckReport = {
  mode: "changed",
  results: [
    {
      id: "max-lines",
      level: "error",
      findings: [
        { path: "src/a.ts", message: "520 líneas de código (máximo 500)" },
        { path: "src/b.ts", message: "510 líneas de código (máximo 500)" },
        {
          path: "src/c.ts",
          message: "320 líneas de código (aviso a partir de 300)",
          severity: "warning",
        },
      ],
    },
    {
      id: "layers",
      level: "error",
      findings: [{ path: "src/domain/x.ts", line: 3, message: "importa src/ui" }],
    },
    {
      id: "todo",
      level: "warn",
      findings: [{ path: "src/d.ts", line: 12, message: "TODO sin referencia" }],
    },
    {
      id: "secrets",
      level: "error",
      findings: [],
      skipped: "no está instalado betterleaks ni gitleaks",
    },
    { id: "format", level: "error", findings: [] },
  ],
};

const text = (report: CheckReport, verbose = false, lang: "es" | "en" = "es", maxFindings = 10) =>
  renderReport(report, { lang, verbose, maxFindings });

describe("the check report", () => {
  it("shows only the failures, grouped, and ends with a summary, in few lines", () => {
    const output = text(REPORT);
    expect(output).toBe(
      [
        "FALLA max-lines",
        "  src/a.ts 520 líneas de código (máximo 500)",
        "  src/b.ts 510 líneas de código (máximo 500)",
        "  src/c.ts 320 líneas de código (aviso a partir de 300)",
        "FALLA layers",
        "  src/domain/x.ts:3 importa src/ui",
        "AVISO todo",
        "  src/d.ts:12 TODO sin referencia",
        "OK 1/5 · FALLA: max-lines, layers · AVISO: todo · SIN EJECUTAR: secrets",
      ].join("\n"),
    );
    expect(output.split("\n").length).toBeLessThan(15);
  });

  it("cuts each check at the configured number of findings", () => {
    expect(text(REPORT, false, "es", 2)).toContain(
      "  src/b.ts 510 líneas de código (máximo 500)\n  … y 1 más\nFALLA layers",
    );
    expect(text(REPORT, false, "en", 1)).toContain("  … and 2 more\nFAIL layers");
  });

  it("gives the detail with --verbose: every finding, what passed and why a check did not run", () => {
    const output = text(REPORT, true, "en", 1);
    expect(output).toContain("  src/c.ts 320 líneas de código (aviso a partir de 300)");
    expect(output).toContain("OK format");
    expect(output).toContain("NOT RUN secrets: no está instalado betterleaks ni gitleaks");
    expect(output.split("\n").at(-1)).toBe(
      "OK 1/5 · FAIL: max-lines, layers · WARN: todo · NOT RUN: secrets",
    );
  });

  it("fails only for an error-level check with an error finding", () => {
    expect(reportExitCode(REPORT)).toBe(1);
    const warningsOnly: CheckReport = {
      mode: "all",
      results: [
        { id: "todo", level: "warn", findings: [{ message: "x" }] },
        { id: "max-lines", level: "error", findings: [{ message: "y", severity: "warning" }] },
      ],
    };
    expect(reportExitCode(warningsOnly)).toBe(0);
    expect(text(warningsOnly)).toBe(
      "AVISO todo\n  x\nAVISO max-lines\n  y\nOK 0/2 · AVISO: todo, max-lines",
    );
    expect(text({ mode: "staged", results: [] })).toBe("OK 0/0");
  });

  it("is JSON for CI", () => {
    const json = reportJson(REPORT);
    expect(json).toMatchObject({
      mode: "changed",
      summary: {
        passed: 1,
        total: 5,
        failed: ["max-lines", "layers"],
        warned: ["todo"],
        skipped: ["secrets"],
      },
      exitCode: 1,
    });
    expect(json.checks[3]).toEqual({
      id: "secrets",
      level: "error",
      status: "skipped",
      findings: [],
      reason: "no está instalado betterleaks ni gitleaks",
    });
  });
});

describe("the checks configuration", () => {
  it("has a level per check, error by default, a cut and the excluded folders", () => {
    const resolved = resolveConfig({
      version: 1,
      checks: { levels: { todo: "warn", secrets: "off" }, maxFindings: 5 },
    });
    if (!resolved.ok) throw new Error("invalid config");
    expect(checkLevel(resolved.config, "todo")).toBe("warn");
    expect(checkLevel(resolved.config, "secrets")).toBe("off");
    expect(checkLevel(resolved.config, "max-lines")).toBe("error");
    expect(resolved.config.checks.maxFindings).toBe(5);
    expect(DEFAULT_CONFIG.checks.exclude).toContain("**/node_modules/**");
    expect(DEFAULT_CONFIG.checks.exclude).toContain("**/.dart_tool/**");
    expect(resolveConfig({ version: 1, checks: { levels: { todo: "loud" } } }).ok).toBe(false);
  });
});
