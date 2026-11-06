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

describe("an adjustment asked for while the tasks are implemented", () => {
  // T2 is still to do: the change was in implementing, not in acceptance.
  const ctx = { phase: "adjusting" as const, approved, doneTasks: new Set(["T1"]) };
  const outside = (text: string) =>
    check(text, ctx).filter((found) => found.startsWith("pending-tasks-only:"));

  it("AC2: admits a corrected verify of a pending task", () => {
    const text = STANDARD.replace(
      "  - verify: flutter test test/features/analytics\n",
      "  - verify: flutter test test/features/analytics/evolucion_card_test.dart\n",
    );
    expect(text).not.toBe(STANDARD);
    const diagnostics = check(text, ctx);
    expect(diagnostics.filter((found) => found.startsWith("pending-tasks-only:"))).toEqual([]);
    expect(diagnostics).not.toContain("done-task-changed:T2");
  });

  it("AC2: rejects a task added or removed, and a criterion added, modified or removed", () => {
    const added = STANDARD.replace(
      "\n## Riesgos",
      "- [ ] T3: Corregir el filtro anual\n  - files: lib/features/home/home_estudiante_provider.dart\n  - ac: AC1\n  - type: fix\n  - verify: flutter test\n\n## Riesgos",
    );
    expect(outside(added)).toEqual(["pending-tasks-only:T3"]);
    const removed = STANDARD.replace(
      /- \[ \] T2:[\s\S]*?verify: flutter test test\/features\/analytics\n/,
      "",
    );
    expect(outside(removed)).toEqual(["pending-tasks-only:T2"]);
    const modified = STANDARD.replace("esa serie se oculta", "esa serie se atenúa");
    expect(outside(modified)).toEqual(["pending-tasks-only:AC2"]);
    const criterion = STANDARD.replace(
      "\n## Archivos",
      "- AC3: CUANDO el estudiante no tiene notas ENTONCES ve un mensaje vacío.\n\n## Archivos",
    );
    expect(outside(criterion)).toEqual(["pending-tasks-only:AC3"]);
    const [message] = analyzeSpec(added, { ...ctx, config: DEFAULT_CONFIG }).diagnostics.filter(
      (found) => found.code === "pending-tasks-only",
    );
    expect(message?.severity).toBe("error");
    expect(message?.message).toContain("T3");
  });

  it("AC2: warns when a pending task gains a file outside the approved ones", () => {
    const text = STANDARD.replace(
      "\n## Tareas",
      "- crear lib/features/analytics/insight.dart — mensaje\n\n## Tareas",
    ).replace(
      "  - files: lib/features/analytics/analytics_estudiante_dashboard_cards.dart, test/features/analytics/evolucion_card_test.dart\n",
      "  - files: lib/features/analytics/analytics_estudiante_dashboard_cards.dart, lib/features/analytics/insight.dart, test/features/analytics/evolucion_card_test.dart\n",
    );
    const diagnostics = check(text, ctx);
    expect(diagnostics).toContain("possible-new-scope:T2");
    expect(diagnostics.filter((found) => found.startsWith("pending-tasks-only:"))).toEqual([]);
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
