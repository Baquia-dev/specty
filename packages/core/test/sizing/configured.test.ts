// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  computeSize,
  DEFAULT_CONFIG,
  type ResolvedConfig,
  recommendEffort,
  recommendTaskEffort,
  resolveConfig,
  type Task,
} from "../../src";
import { check, fixture, specOf } from "../helpers";

const STANDARD = fixture("standard.es.md");
const HOME = "lib/features/home/home_estudiante_provider.dart";
const ANALYTICS = "lib/features/analytics/analytics_estudiante_dashboard_cards.dart";

/** What Specty uses with a `config.yaml` that holds `input`. */
function configOf(input: Readonly<Record<string, unknown>>): ResolvedConfig {
  const result = resolveConfig({ version: 1, ...input });
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  }
  return result.config;
}

/** The keys of the issues of a `config.yaml` that holds `input`; none when it is valid. */
function issuesOf(input: Readonly<Record<string, unknown>>): readonly string[] {
  const result = resolveConfig({ version: 1, ...input });
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

/** The standard example with `count` extra tasks, each with a code file of its own. */
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

/**
 * The standard example touching every kind of signal: 4 modified files (one sensitive, one a
 * manifest), 1 created, 1 deleted and 1 renamed, in 3 modules, with 2 tasks.
 */
const EVERY_SIGNAL = STANDARD.replace(
  "\n## Tareas",
  [
    "- modificar lib/core/auth/session.dart — sesión",
    "- modificar pubspec.yaml — dependencia",
    "- borrar lib/features/home/old.dart — viejo",
    "- renombrar lib/features/home/a.dart -> lib/features/home/b.dart — nombre",
    "",
    "## Tareas",
  ].join("\n"),
);

const task = (files: readonly string[], effort?: Task["effort"]): Task => ({
  id: "T1",
  title: "x",
  done: false,
  files: [...files],
  ...(effort !== undefined ? { effort } : {}),
});

describe("size and effort without `sizing` nor `effort`", () => {
  it("AC1: resolves today's weights, thresholds, ratio and effort table", () => {
    const config = configOf({});
    expect(config.sizing).toEqual({
      weights: {
        create: 1,
        modify: 1,
        delete: 2,
        rename: 2,
        module: 2,
        sensitive: 3,
        dependencies: 2,
        task: 1,
        fanIn: 1,
        noTests: 2,
      },
      tasksWithoutWeight: 3,
      highFanIn: 10,
      nearRatio: 0.8,
    });
    expect(config.effort).toEqual({
      S: { plan: "medium", implement: "low" },
      M: { plan: "high", implement: "medium" },
      L: { plan: "high", implement: "medium" },
      XL: { plan: "max", implement: "high" },
      task: { lowMaxFiles: 1, highMinFiles: 4 },
    });
    expect(DEFAULT_CONFIG.sizing).toEqual(config.sizing);
    expect(DEFAULT_CONFIG.effort).toEqual(config.effort);
  });

  it("AC1: sizes, warns and recommends as today", () => {
    const config = configOf({});
    // 4 modified + 1 created + 2 deleted + 2 renamed + 2 × 2 extra modules + 3 sensitive + 2 dependencies.
    expect(computeSize(specOf(EVERY_SIGNAL), config).score).toBe(4 + 1 + 2 + 2 + 4 + 3 + 2);
    const repo = { fanIn: { [HOME]: 10, [ANALYTICS]: 9 }, modulesWithoutTests: ["analytics"] };
    // 3 files + 2 for the extra module + 1 widely imported file + 2 for a module without tests.
    expect(computeSize(specOf(STANDARD), config, repo).score).toBe(3 + 2 + 1 + 2);
    expect(computeSize(specOf(withTasks(2)), config).score).toBe(5 + 2 + 1);
    expect(check(withTasks(4), { config })).not.toContain("size-near-split");
    expect(check(withTasks(5), { config })).toContain("size-near-split");
    expect(recommendEffort("S", undefined, config.effort)).toEqual({
      plan: "medium",
      implement: "low",
    });
    expect(recommendEffort("XL", undefined, config.effort)).toEqual({
      plan: "max",
      implement: "high",
    });
    expect(recommendEffort("M")).toEqual({ plan: "high", implement: "medium" });
    expect(recommendTaskEffort(task(["lib/a.dart"]), config)).toBe("low");
    expect(recommendTaskEffort(task(["lib/a.dart", "lib/b.dart", "lib/c.dart"]), config)).toBe(
      "medium",
    );
    expect(
      recommendTaskEffort(task(["lib/a.dart", "lib/b.dart", "lib/c.dart", "lib/d.dart"]), config),
    ).toBe("high");
    expect(recommendTaskEffort(task(["lib/auth/a.dart"]), config)).toBe("high");
  });
});

describe("the configured size", () => {
  it("AC2: scores each signal with its configured weight", () => {
    const config = configOf({
      sizing: {
        weights: {
          create: 5,
          modify: 0,
          delete: 7,
          rename: 11,
          module: 13,
          sensitive: 17,
          dependencies: 19,
        },
      },
    });
    expect(computeSize(specOf(EVERY_SIGNAL), config).score).toBe(
      0 * 4 + 5 + 7 + 11 + 13 * 2 + 17 + 19,
    );
  });

  it("AC2: keeps today's weight for each key the configuration lacks", () => {
    const config = configOf({ sizing: { weights: { sensitive: 10 } } });
    expect(computeSize(specOf(EVERY_SIGNAL), config).score).toBe(4 + 1 + 2 + 2 + 4 + 10 + 2);
  });

  it("AC2: weighs the tasks past the configured ones without weight", () => {
    const config = configOf({ sizing: { tasksWithoutWeight: 0, weights: { task: 4 } } });
    const size = computeSize(specOf(STANDARD), config);
    // 3 files + 2 for the extra module + 4 for each of its 2 tasks.
    expect(size.score).toBe(3 + 2 + 4 * 2);
    expect(size.reasons).toContainEqual({ code: "tasks", count: 2 });
  });

  it("AC2: counts a file as widely imported from the configured threshold, with its weights", () => {
    const config = configOf({ sizing: { highFanIn: 3, weights: { fanIn: 5, noTests: 7 } } });
    const repo = { fanIn: { [HOME]: 3, [ANALYTICS]: 2 }, modulesWithoutTests: ["home"] };
    const size = computeSize(specOf(STANDARD), config, repo);
    expect(size.signals.highFanIn).toEqual([HOME]);
    expect(size.score).toBe(3 + 2 + 5 + 7);
  });

  it("AC2: still lets the model raise the size and never lower it", () => {
    // 3 files + 3 for the extra module: M.
    const config = configOf({ sizing: { weights: { module: 3 } } });
    const estimated = (adjust: number) =>
      specOf(
        STANDARD.replace(
          "kind: standard",
          `kind: standard\nestimate:\n  adjust: ${adjust}\n  reason: Motivo`,
        ),
      );
    expect(computeSize(estimated(-1), config)).toMatchObject({
      level: "M",
      baseLevel: "M",
      adjust: 0,
    });
    expect(computeSize(estimated(1), config)).toMatchObject({
      level: "L",
      baseLevel: "M",
      adjust: 1,
    });
  });

  it("AC3: warns that the change is close to splitting from the configured ratio", () => {
    const half = configOf({ sizing: { nearRatio: 0.5 } });
    expect(check(STANDARD, { config: half })).not.toContain("size-near-split");
    // 4 tasks of 8 and 4 code files of 15.
    expect(check(withTasks(2), { config: half })).toContain("size-near-split");
    expect(check(withTasks(2))).not.toContain("size-near-split");
    const whole = configOf({ sizing: { nearRatio: 1 } });
    expect(check(withTasks(5), { config: whole })).not.toContain("size-near-split");
    expect(check(withTasks(6), { config: whole })).toContain("size-near-split");
  });
});

describe("the configured effort", () => {
  it("AC4: recommends the configured effort for each size, and the model only raises it", () => {
    const config = configOf({
      effort: { S: { plan: "high" }, XL: { plan: "high", implement: "medium" } },
    });
    expect(recommendEffort("S", undefined, config.effort)).toEqual({
      plan: "high",
      implement: "low",
    });
    expect(recommendEffort("M", undefined, config.effort)).toEqual({
      plan: "high",
      implement: "medium",
    });
    expect(recommendEffort("XL", undefined, config.effort)).toEqual({
      plan: "high",
      implement: "medium",
    });
    const reviewed = (level: string, reason: string) =>
      specOf(
        STANDARD.replace(
          "kind: standard",
          `kind: standard\neffort:\n  review: ${level}\n  reason: ${reason}`,
        ),
      );
    expect(recommendEffort("XL", reviewed("max", "Fechas ambiguas"), config.effort)).toEqual({
      plan: "max",
      implement: "medium",
      raisedBy: ["Fechas ambiguas"],
    });
    expect(recommendEffort("XL", reviewed("low", "Fácil"), config.effort)).toEqual({
      plan: "high",
      implement: "medium",
    });
  });

  it("AC4: suggests each task's effort with the configured file limits; a sensitive path stays high", () => {
    const config = configOf({ effort: { task: { lowMaxFiles: 2, highMinFiles: 3 } } });
    expect(recommendTaskEffort(task(["lib/a.dart", "lib/b.dart"]), config)).toBe("low");
    expect(recommendTaskEffort(task(["lib/a.dart", "lib/b.dart", "lib/c.dart"]), config)).toBe(
      "high",
    );
    expect(recommendTaskEffort(task(["lib/auth/a.dart"]), config)).toBe("high");
    expect(
      recommendTaskEffort(
        task(["lib/a.dart", "lib/b.dart", "lib/c.dart"], { level: "low" }),
        config,
      ),
    ).toBe("high");
    const wide = configOf({ effort: { task: { lowMaxFiles: 0, highMinFiles: 6 } } });
    expect(recommendTaskEffort(task(["lib/a.dart"]), wide)).toBe("medium");
    expect(recommendTaskEffort(task(["lib/a.dart"], { level: "max" }), wide)).toBe("max");
    const above = configOf({ effort: { task: { highMinFiles: 2 } } });
    expect(recommendTaskEffort(task(["lib/a.dart"]), above)).toBe("low");
    expect(recommendTaskEffort(task(["lib/a.dart", "lib/b.dart"]), above)).toBe("high");
  });
});

describe("invalid `sizing` and `effort`", () => {
  it("AC5: rejects each invalid key with its key, so Specty does not use the file", () => {
    expect(issuesOf({ sizing: { weights: { create: -1 } } })).toEqual(["sizing.weights.create"]);
    expect(issuesOf({ sizing: { weights: { sensitive: 1.5 } } })).toEqual([
      "sizing.weights.sensitive",
    ]);
    expect(issuesOf({ sizing: { tasksWithoutWeight: -1 } })).toEqual(["sizing.tasksWithoutWeight"]);
    expect(issuesOf({ sizing: { highFanIn: 0 } })).toEqual(["sizing.highFanIn"]);
    expect(issuesOf({ sizing: { nearRatio: 0 } })).toEqual(["sizing.nearRatio"]);
    expect(issuesOf({ sizing: { nearRatio: 1.2 } })).toEqual(["sizing.nearRatio"]);
    expect(issuesOf({ effort: { M: { plan: "huge" } } })).toEqual(["effort.M.plan"]);
    expect(issuesOf({ effort: { task: { lowMaxFiles: 4, highMinFiles: 4 } } })).toEqual([
      "effort.task.lowMaxFiles",
    ]);
    // Above the default `highMinFiles`, 4.
    expect(issuesOf({ effort: { task: { lowMaxFiles: 5 } } })).toEqual(["effort.task.lowMaxFiles"]);
    expect(issuesOf({ effort: { task: { highMinFiles: 0 } } })).toContain(
      "effort.task.highMinFiles",
    );
  });

  it("AC5: rejects keys that do not exist, the old effort per tool among them", () => {
    expect(issuesOf({ sizing: { weights: { files: 1 } } })).toEqual(["sizing.weights"]);
    expect(issuesOf({ sizing: { fanIn: 10 } })).toEqual(["sizing"]);
    expect(issuesOf({ effort: { XXL: { plan: "max" } } })).toEqual(["effort"]);
    expect(issuesOf({ effort: { M: { review: "max" } } })).toEqual(["effort.M"]);
    expect(issuesOf({ effort: { "claude-code": { S: "low" } } })).toEqual(["effort"]);
  });

  it("AC5: accepts weights at 0, no tasks without weight and a ratio of 1", () => {
    expect(
      issuesOf({
        sizing: { weights: { create: 0, sensitive: 0 }, tasksWithoutWeight: 0, nearRatio: 1 },
        effort: { task: { lowMaxFiles: 0, highMinFiles: 1 } },
      }),
    ).toEqual([]);
  });
});
