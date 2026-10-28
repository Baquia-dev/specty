// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, testCycle, validateSpec } from "../../src";
import { check, fixture, withConfig } from "../helpers";

const STANDARD = fixture("standard.es.md");

/** The standard example with `count` extra tasks, each declared and covering AC1. */
function withTasks(count: number): string {
  const files = Array.from(
    { length: count },
    (_, index) => `- crear lib/features/home/extra${index}.dart — extra`,
  );
  const tasks = Array.from(
    { length: count },
    (_, index) =>
      `- [ ] T${index + 3}: Extra ${index}\n  - files: lib/features/home/extra${index}.dart\n  - ac: AC1\n  - verify: flutter test\n  - type: chore`,
  );
  return STANDARD.replace("\n## Tareas", `${files.join("\n")}\n\n## Tareas`).replace(
    "\n## Riesgos",
    `${tasks.join("\n")}\n\n## Riesgos`,
  );
}

describe("criteria quality", () => {
  it("warns about vague terms and missing WHEN/THEN", () => {
    const text = STANDARD.replace(
      "ENTONCES esa serie se oculta o se muestra sin recargar la vista.",
      "ENTONCES la leyenda responde rápido y se ve bien.",
    ).replace("- AC1: CUANDO el estudiante elige", "- AC1: El estudiante elige");
    const diagnostics = check(text);
    expect(diagnostics).toContain("criterion-vague:AC2");
    expect(diagnostics).toContain("criterion-unstructured:AC1");
  });
});

describe("tests policy", () => {
  it("is a warning when recommended and an error when required", () => {
    const required = withConfig({ policy: { tests: "required" } });
    const { spec, locations } = parseSpec(STANDARD);
    const diagnostics = validateSpec(spec, { phase: "draft", config: required, locations });
    expect(diagnostics.find((entry) => entry.code === "task-no-tests")?.severity).toBe("error");
    expect(check(STANDARD, { config: withConfig({ policy: { tests: "off" } }) })).toEqual([]);
  });

  it("AC1: is an error under contract too", () => {
    const contract = withConfig({ policy: { tests: "contract" } });
    const { spec, locations } = parseSpec(STANDARD);
    const diagnostics = validateSpec(spec, { phase: "draft", config: contract, locations });
    expect(diagnostics.find((entry) => entry.code === "task-no-tests")?.severity).toBe("error");
  });
});

describe("testCycle", () => {
  const { spec } = parseSpec(STANDARD);
  const typed = (type: string) =>
    parseSpec(STANDARD.replace(/( {2}- ac: .+)/g, `$1\n  - type: ${type}`)).spec;
  const quick = (type: string) => ({
    ...typed(type),
    frontmatter: { ...spec.frontmatter, kind: "quick" as const },
  });

  it("AC1: gives a feature's cycle to a pending feat task, and a bug's to fix tasks alone", () => {
    expect(spec.sections.tasks?.items.every((task) => task.type === undefined)).toBe(true);
    expect(testCycle(spec, "contract")).toBe("feature");
    expect(testCycle(typed("feat"), "contract")).toBe("feature");
    expect(testCycle(typed("fix"), "contract")).toBe("bug");
    expect(testCycle(quick("fix"), "contract")).toBe("bug");
  });

  it("AC3: gives none without contract, without feat or fix tasks, or to a quick feat", () => {
    for (const policy of ["required", "recommended", "off"] as const) {
      expect(testCycle(spec, policy), policy).toBeUndefined();
    }
    expect(testCycle(typed("refactor"), "contract")).toBeUndefined();
    expect(testCycle(quick("feat"), "contract")).toBeUndefined();
  });

  it("AC4: looks only at the tasks not done yet, as after an adjustment", () => {
    const done = new Set(["T1", "T2"]);
    expect(testCycle(spec, "contract", done)).toBeUndefined();
    expect(testCycle(spec, "contract", new Set(["T1"]))).toBe("feature");
    const mixed = parseSpec(
      STANDARD.replace(/(T2: .+\n {2}- files: .+\n {2}- ac: .+)/, "$1\n  - type: fix"),
    ).spec;
    expect(testCycle(mixed, "contract", new Set(["T1"]))).toBe("bug");
  });
});

describe("size limits", () => {
  it("asks to split changes over the thresholds", () => {
    expect(check(withTasks(7))).toContain("split-required");
  });

  it("warns when a change is close to a threshold", () => {
    expect(check(withTasks(5))).toContain("size-near-split");
  });

  it("counts only code files against the file limit", () => {
    // A high L threshold keeps the size level out of the way: only the file limit decides.
    const config = withConfig({ size: { S: 4, M: 10, L: 99 } });
    const code = (count: number, prefix = "lib/features/home/extra") =>
      Array.from({ length: count }, (_, index) => `- crear ${prefix}${index}.dart — extra`);
    const others = [
      ...code(6, "test/features/home/extra_test"),
      "- modificar docs/ARCHITECTURE.md — diseño",
      "- modificar lib/README.md — uso",
    ];
    const withFiles = (lines: readonly string[]) =>
      STANDARD.replace("\n## Tareas", `${lines.join("\n")}\n\n## Tareas`);
    // The example declares 2 code files: 13 more reach 15, with 9 tests and docs besides.
    expect(check(withFiles([...code(13), ...others]), { config })).not.toContain("split-required");
    const over = parseSpec(withFiles([...code(14), ...others]));
    const diagnostics = validateSpec(over.spec, { phase: "draft", config });
    expect(diagnostics.find((entry) => entry.code === "split-required")?.message).toContain(
      "(16 archivos de código, máximo 15)",
    );
  });

  it("counts the matches of a glob against the file limit", () => {
    const config = withConfig({ size: { S: 4, M: 10, L: 99 } });
    const text = STANDARD.replace(
      "\n## Tareas",
      "- modificar lib/features/home/widgets/** — vistas\n\n## Tareas",
    );
    const matches = Array.from(
      { length: 10 },
      (_, index) => `lib/features/home/widgets/w${index}.dart`,
    );
    const repo = { globMatches: { "lib/features/home/widgets/**": matches } };
    // 2 code files, 10 matches and the glob itself: 13 of 15, close to the limit.
    expect(check(text, { config, repo })).toContain("size-near-split");
    expect(check(text, { config })).not.toContain("size-near-split");
  });

  it("warns about tasks that touch too many files", () => {
    const config = withConfig({ split: { ...DEFAULT_CONFIG.split, taskMaxFiles: 1 } });
    expect(check(STANDARD, { config })).toContain("task-too-large:T2");
  });
});

describe("file reasons", () => {
  it("warns about files without a reason, except in retros", () => {
    const text = STANDARD.replace(" — rediseño de la tarjeta", "");
    expect(check(text)).toContain(
      "file-reason-missing:file:lib/features/analytics/analytics_estudiante_dashboard_cards.dart",
    );
  });
});
