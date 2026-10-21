// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { analyzeSpec, DEFAULT_CONFIG } from "../../src";
import { check, fixture, specOf } from "../helpers";

const STANDARD = fixture("standard.es.md");
const approved = specOf(STANDARD);

describe("adjusting", () => {
  const ctx = { phase: "adjusting" as const, approved, doneTasks: new Set(["T1", "T2"]) };

  it("accepts new tasks over approved files", () => {
    const text = `${STANDARD}\n`.replace(
      "\n## Riesgos",
      "- [ ] T3: Corregir el filtro anual\n  - files: lib/features/home/home_estudiante_provider.dart\n  - ac: AC1\n  - type: fix\n  - verify: flutter test\n\n## Riesgos",
    );
    expect(check(text, ctx)).toEqual(["task-no-tests:T1", "task-no-tests:T3"]);
  });

  it("rejects changes to done tasks", () => {
    const text = STANDARD.replace("Modelo multiserie y filtro temporal", "Modelo nuevo");
    expect(check(text, ctx)).toContain("done-task-changed:T1");
  });

  it("flags new tasks that touch files outside the approved scope", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- crear lib/features/analytics/insight.dart — mensaje\n\n## Tareas",
    ).replace(
      "\n## Riesgos",
      "- [ ] T3: Mensaje de tendencia\n  - files: lib/features/analytics/insight.dart, test/features/analytics/insight_test.dart\n  - ac: AC1\n  - verify: flutter test\n\n## Riesgos",
    );
    const diagnostics = check(text, ctx);
    expect(diagnostics).toContain("possible-new-scope:T3");
    expect(diagnostics).toContain("task-file-undeclared:T3");
  });
});

describe("closing", () => {
  const ctx = { phase: "closing" as const, approved };

  it("accepts changes limited to the Closing section", () => {
    const text = `${STANDARD}\n## Cierre\n\n### Resumen\n\nHecho.\n`;
    expect(check(text, ctx)).toEqual(["task-no-tests:T1"]);
  });

  it("rejects changes outside the Closing section", () => {
    const text = `${STANDARD.replace("La vista del docente.", "La vista del rector.")}\n## Cierre\n\nHecho.\n`;
    expect(check(text, ctx)).toContain("closing-outside:section:outOfScope");
  });
});

describe("id reuse", () => {
  it("rejects ids that belonged to deleted items", () => {
    const previous = specOf(
      STANDARD.replace('- A2: "Por periodo" agrupa por trimestres académicos.\n', ""),
    );
    const ctx = { previous, maxIds: { A: 2 } };
    expect(check(STANDARD, ctx)).toContain("id-reused:A2");
    expect(check(STANDARD.replace("- A2:", "- A3:"), ctx)).not.toContain("id-reused:A3");
  });
});

describe("analyzeSpec", () => {
  it("returns canonical text, size and diagnostics with errors first", () => {
    const analysis = analyzeSpec(fixture("messy.es.md"), {
      phase: "draft",
      config: DEFAULT_CONFIG,
    });
    expect(analysis.valid).toBe(true);
    expect(analysis.text).toBe(fixture("messy.es.canonical.md"));
    expect(analysis.size.level).toBe("S");
    expect(analysis.diagnostics.map((entry) => entry.code)).toEqual(["task-no-tests"]);
    const broken = analyzeSpec(`${fixture("messy.es.md")}\n## Notas\n\nx\n`, {
      phase: "draft",
      config: DEFAULT_CONFIG,
    });
    expect(broken.valid).toBe(false);
    expect(broken.diagnostics[0]?.severity).toBe("error");
  });
});
