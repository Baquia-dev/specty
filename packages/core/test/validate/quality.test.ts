// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  analyzeSpec,
  DEFAULT_CONFIG,
  parseSpec,
  testCycle,
  type ValidationContext,
  validateSpec,
} from "../../src";
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

  it("spares a refactor or a perf under contract, whose contract is the existing tests", () => {
    for (const type of ["refactor", "perf"]) {
      const { spec, locations } = parseSpec(
        STANDARD.replace(/( {2}- ac: .+)/g, `$1\n  - type: ${type}`),
      );
      const severities = (config: typeof DEFAULT_CONFIG) =>
        validateSpec(spec, { phase: "draft", config, locations })
          .filter((entry) => entry.code === "task-no-tests")
          .map((entry) => entry.severity);
      expect(severities(withConfig({ policy: { tests: "contract" } })), type).toEqual([]);
      expect(severities(withConfig({ policy: { tests: "required" } })), type).toContain("error");
    }
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

describe("vertical slices", () => {
  it("AC2: rejects horizontal technical layers as epic slices", () => {
    const epic = fixture("epic.en.md");
    const horizontal = epic.replace(
      "- C1: API contracts and typed models",
      "- C1: Database schema and migrations",
    );
    expect(check(horizontal)).toContain("slice-horizontal:C1");
  });
});

describe("the person's vague terms and horizontal layers", () => {
  /** The validation of `text` with the person's terms and layers: each `code:target` and its message. */
  function validated(
    text: string,
    warnings?: { readonly vagueTerms: string[]; readonly horizontalLayers: string[] },
  ): ReadonlyMap<string, string> {
    const parsed = parseSpec(text);
    const config = warnings === undefined ? DEFAULT_CONFIG : withConfig({ warnings });
    const found = validateSpec(parsed.spec, {
      phase: "draft",
      config,
      locations: parsed.locations,
    });
    return new Map(found.map((entry) => [`${entry.code}:${entry.target}`, entry.message]));
  }

  it("AC4: warns about a criterion with one of the person's terms, without accents or capitals, and Specty's still warn", () => {
    const text = STANDARD.replace(
      "ENTONCES esa serie se oculta o se muestra sin recargar la vista.",
      "ENTONCES esa serie se oculta de forma ELEGANTE y sin friccion.",
    ).replace(
      "ENTONCES el gráfico muestra un punto por mes para cada materia.",
      "ENTONCES el gráfico se ve bien.",
    );
    expect(validated(text).has("criterion-vague:AC2")).toBe(false);
    const mine = validated(text, {
      vagueTerms: ["Elegante", "sin fricción", "pulcro"],
      horizontalLayers: [],
    });
    const warned = mine.get("criterion-vague:AC2");
    expect(warned).toContain("Elegante");
    expect(warned).toContain("sin fricción");
    expect(warned).not.toContain("pulcro");
    expect(mine.get("criterion-vague:AC1")).toContain("se ve bien");
  });

  it("AC5: rejects an epic slice named after one of the person's layers, and Specty's layers still do", () => {
    const epic = fixture("epic.en.md")
      .replace("- C1: API contracts and typed models", "- C1: The SERVICES layer for every card")
      .replace("- C2: Grades card", "- C2: Database schema");
    expect(validated(epic).has("slice-horizontal:C1")).toBe(false);
    const mine = validated(epic, { vagueTerms: [], horizontalLayers: ["Services layer"] });
    expect(mine.get("slice-horizontal:C1")).toContain("Services layer");
    expect(mine.get("slice-horizontal:C2")).toContain("database");
    expect(mine.has("slice-horizontal:C3")).toBe(false);
  });
});

describe("the type check under contract", () => {
  const contract = withConfig({ policy: { tests: "contract" } });
  const TYPES = "flutter analyze";
  const warned = (text: string, ctx: Partial<ValidationContext>) =>
    check(text, ctx).filter((label) => label.startsWith("task-no-typecheck"));

  it("AC1: warns when the last code task does not run the project's type check", () => {
    const { spec, locations } = parseSpec(STANDARD);
    const found = validateSpec(spec, {
      phase: "draft",
      config: contract,
      locations,
      typecheck: TYPES,
    }).filter((entry) => entry.code === "task-no-typecheck");
    expect(found.map((entry) => [entry.target, entry.severity])).toEqual([["T2", "warning"]]);
    expect(found[0]?.message).toContain("`flutter analyze`");
    expect(warned(withTasks(1), { config: contract, typecheck: TYPES })).toEqual([
      "task-no-typecheck:T2",
    ]);
  });

  it("AC1: does not warn when the last code task runs it, verify.quick or verify.full does", () => {
    const runs = (command: string) =>
      STANDARD.replace(
        "verify: flutter test test/features/analytics",
        `verify: flutter test test/features/analytics && ${command}`,
      );
    expect(warned(runs(TYPES), { config: contract, typecheck: TYPES })).toEqual([]);
    const quick = withConfig({
      policy: { tests: "contract" },
      verify: { ...DEFAULT_CONFIG.verify, quick: TYPES },
    });
    expect(warned(STANDARD, { config: quick, typecheck: TYPES })).toEqual([]);
    const full = withConfig({
      policy: { tests: "contract" },
      verify: { ...DEFAULT_CONFIG.verify, full: "make check" },
    });
    expect(warned(runs("make check"), { config: full, typecheck: TYPES })).toEqual([]);
  });

  it("AC1: does not warn without contract or without a type check command", () => {
    const required = withConfig({ policy: { tests: "required" } });
    expect(warned(STANDARD, { config: required, typecheck: TYPES })).toEqual([]);
    expect(warned(STANDARD, { config: contract })).toEqual([]);
  });

  it("P69: an empty verify.full or type check command does not count as run", () => {
    const empty = withConfig({
      policy: { tests: "contract" },
      verify: { ...DEFAULT_CONFIG.verify, full: "" },
    });
    expect(warned(STANDARD, { config: empty, typecheck: TYPES })).toEqual(["task-no-typecheck:T2"]);
    expect(warned(STANDARD, { config: contract, typecheck: "" })).toEqual([]);
  });

  it("P70: does not warn when the last code task is already done, as in an adjustment", () => {
    const adjusting = { phase: "adjusting", config: contract, typecheck: TYPES } as const;
    expect(warned(STANDARD, { ...adjusting, doneTasks: new Set(["T1", "T2"]) })).toEqual([]);
    expect(warned(STANDARD, { ...adjusting, doneTasks: new Set(["T1"]) })).toEqual([
      "task-no-typecheck:T2",
    ]);
  });

  it("P71: warns on a quick change too, and not while closing", () => {
    const quick = fixture("quick.en.md");
    expect(warned(quick, { config: contract, typecheck: "pnpm typecheck" })).toEqual([
      "task-no-typecheck:T1",
    ]);
    expect(warned(STANDARD, { phase: "closing", config: contract, typecheck: TYPES })).toEqual([]);
  });
});

describe("the type check in a code task that is not the last", () => {
  const contract = withConfig({ policy: { tests: "contract" } });
  const TYPES = "flutter analyze";
  const early = (text: string, ctx: Partial<ValidationContext>) =>
    check(text, ctx).filter((label) => label.startsWith("task-early-typecheck"));
  /** The standard example with T1, a code task before the last one, also running `command`. */
  const firstRuns = (command: string, text = STANDARD) =>
    text.replace(
      "verify: flutter test test/features/home",
      `verify: flutter test test/features/home && ${command}`,
    );
  /** `text` with one more task before the risks. */
  const withTask = (text: string, task: string) =>
    text.replace("\n## Riesgos", `${task}\n\n## Riesgos`);
  const T3 =
    "- [ ] T3: Extra\n  - files: test/features/home/extra_test.dart\n  - ac: AC1\n  - verify: flutter test test/features/home";
  /** A valid English spec under `contract` whose two code tasks, each with its test, run the type check. */
  const ENGLISH = [
    "---\nkind: standard\n---\n\n# Fix the sign-in label\n",
    '## Goal\n\nThe sign-in button reads "Sing in"; it must read "Sign in".\n',
    "## Out of scope\n\n- The other buttons.\n",
    "## Assumptions\n\n- A1: The label lives in its own module.\n",
    '## Acceptance criteria\n\n- AC1: WHEN the sign-in page opens THEN its button reads "Sign in".\n',
    "## Files\n",
    "- modify src/components/label.ts — the label",
    "- create src/components/label.test.ts — its test",
    "- modify src/components/sign-in-button.tsx — the button uses it",
    "- create src/components/sign-in-button.test.tsx — its test\n",
    "## Tasks\n",
    "- [ ] T1: The label",
    "  - files: src/components/label.ts, src/components/label.test.ts",
    "  - ac: AC1",
    "  - verify: pnpm test src/components && pnpm typecheck",
    "- [ ] T2: The button",
    "  - files: src/components/sign-in-button.tsx, src/components/sign-in-button.test.tsx",
    "  - ac: AC1",
    "  - verify: pnpm test src/components && pnpm typecheck\n",
  ].join("\n");

  it("AC1: warns on that task, with the command and the later tasks, and suggests running only its tests", () => {
    const { spec, locations } = parseSpec(firstRuns(TYPES, withTask(STANDARD, T3)));
    const found = validateSpec(spec, {
      phase: "draft",
      config: contract,
      locations,
      typecheck: TYPES,
    }).filter((entry) => entry.code === "task-early-typecheck");
    expect(found.map((entry) => entry.target)).toEqual(["T1"]);
    expect(found[0]?.message).toContain("`flutter analyze`");
    expect(found[0]?.message).toContain("T2, T3");
    expect(found[0]?.message).toContain("solo sus tests");
    const both = withTask(STANDARD, T3).replace(
      "verify: flutter test test/features/analytics",
      `verify: flutter test test/features/analytics && ${TYPES}`,
    );
    expect(early(firstRuns(TYPES, both), { config: contract, typecheck: TYPES })).toEqual([
      "task-early-typecheck:T1",
      "task-early-typecheck:T2",
    ]);
  });

  it("AC1: counts verify.full in its verify, and verify.default when it has none", () => {
    const full = withConfig({
      policy: { tests: "contract" },
      verify: { ...DEFAULT_CONFIG.verify, full: "make check" },
    });
    expect(early(firstRuns("make check"), { config: full, typecheck: TYPES })).toEqual([
      "task-early-typecheck:T1",
    ]);
    const byDefault = withConfig({
      policy: { tests: "contract" },
      verify: { ...DEFAULT_CONFIG.verify, default: TYPES },
    });
    const own = STANDARD.replace("\n  - verify: flutter test test/features/home", "");
    expect(early(own, { config: byDefault, typecheck: TYPES })).toEqual([
      "task-early-typecheck:T1",
    ]);
  });

  it("AC2: does not warn on a task that runs only its tests, is done, or has no later code task with tests", () => {
    expect(early(STANDARD, { config: contract, typecheck: TYPES })).toEqual([]);
    const adjusting = { phase: "adjusting", config: contract, typecheck: TYPES } as const;
    expect(early(firstRuns(TYPES), { ...adjusting, doneTasks: new Set(["T1"]) })).toEqual([]);
    expect(early(firstRuns(TYPES), { ...adjusting, doneTasks: new Set(["T2"]) })).toEqual([]);
    const untested = firstRuns(TYPES).replace(
      ", test/features/analytics/evolucion_card_test.dart",
      "",
    );
    expect(early(untested, { config: contract, typecheck: TYPES })).toEqual([]);
    const docs = withTask(untested, `${T3}\n  - type: docs`);
    expect(early(docs, { config: contract, typecheck: TYPES })).toEqual([]);
    expect(early(withTask(untested, T3), { config: contract, typecheck: TYPES })).toEqual([
      "task-early-typecheck:T1",
    ]);
  });

  it("AC3: does not warn without contract, a type check command or a testing phase, nor while closing", () => {
    const text = firstRuns(TYPES);
    const required = withConfig({ policy: { tests: "required" } });
    expect(early(text, { config: required, typecheck: TYPES })).toEqual([]);
    expect(early(text, { config: contract })).toEqual([]);
    expect(early(text, { config: contract, typecheck: "" })).toEqual([]);
    expect(early(text, { phase: "closing", config: contract, typecheck: TYPES })).toEqual([]);
    const refactors = text.replace(/(\n {2}- verify: [^\n]+)/g, "$1\n  - type: refactor");
    expect(early(refactors, { config: contract, typecheck: TYPES })).toEqual([]);
  });

  it("AC4: is a warning that does not stop the proposal, in Spanish and in English", () => {
    const ctx = { phase: "draft", config: contract, typecheck: "pnpm typecheck" } as const;
    const analysis = analyzeSpec(ENGLISH, ctx);
    const errors = analysis.diagnostics.filter((entry) => entry.severity === "error");
    expect(errors.map((entry) => `${entry.code}: ${entry.message}`)).toEqual([]);
    expect(analysis.valid).toBe(true);
    const found = analysis.diagnostics.filter((entry) => entry.code === "task-early-typecheck");
    expect(found.map((entry) => [entry.target, entry.severity])).toEqual([["T1", "warning"]]);
    expect(found[0]?.message).toContain("is not the last code task");
    expect(found[0]?.message).toContain("`pnpm typecheck`");
    expect(found[0]?.message).toContain("only its tests");
    const es = analyzeSpec(firstRuns(TYPES), { ...ctx, typecheck: TYPES }).diagnostics.find(
      (entry) => entry.code === "task-early-typecheck",
    );
    expect(es?.severity).toBe("warning");
    expect(es?.message).toContain("no es la última tarea de código");
  });
});
