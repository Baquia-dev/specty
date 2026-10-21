// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSpec, validateSpec } from "../../src";
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
});

describe("size limits", () => {
  it("asks to split changes over the thresholds", () => {
    expect(check(withTasks(7))).toContain("split-required");
  });

  it("warns when a change is close to a threshold", () => {
    expect(check(withTasks(5))).toContain("size-near-split");
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
