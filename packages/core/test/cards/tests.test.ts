// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  assertionWarnings,
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  type TaskView,
  testRules,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };

const task = (id: string, status: TaskView["status"], extra: Partial<TaskView> = {}): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status,
  files: ["src/a.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  ...extra,
});

const card = (phase: ChangeView["phase"], tasks: TaskView[], ctx = ES): string =>
  renderText(
    nextCard(
      {
        change: {
          id: "20261024-x",
          kind: "standard",
          phase,
          title: "X",
          specPath: ".specty/changes/20261024-x/spec.md",
          revision: 1,
          tasks,
          conventions: [],
          pendingScope: [],
          rejected: [],
          closingSubmitted: false,
          specChanged: false,
        },
        dirty: [],
      },
      ctx,
    ),
    ctx.lang,
  );

describe("test rules", () => {
  it("depend on the task's type and the tests policy", () => {
    expect(testRules({ type: "feat" }, "recommended")).toBe("first");
    expect(testRules({}, "required")).toBe("first");
    expect(testRules({ type: "fix" }, "recommended")).toBe("first");
    expect(testRules({ type: "refactor" }, "recommended")).toBe("keep");
    expect(testRules({ type: "perf" }, "required")).toBe("keep");
    expect(testRules({ type: "docs" }, "recommended")).toBeUndefined();
    expect(testRules({ type: "test" }, "recommended")).toBeUndefined();
    expect(testRules({ type: "feat" }, "off")).toBeUndefined();
  });

  it("show in the task card: test first, and never bend an existing failing test", () => {
    const first = card("implementing", [task("T1", "active", { testRules: "first" })]);
    expect(first).toContain(
      "TESTS:\n  Primero el test: escribe el que comprueba cada criterio y míralo fallar; después, el código.\n  Si falla un test que ya existía, no lo cambies para que pase: para y explícaselo al usuario.",
    );
    const keep = card("implementing", [task("T1", "active", { testRules: "keep" })], {
      ...ES,
      lang: "en",
    });
    expect(keep).toContain(
      "TESTS:\n  If a test that already existed fails, do not change it to make it pass: stop and explain it to the user.\n",
    );
    expect(card("implementing", [task("T1", "active")])).not.toContain("TESTS:");
  });
});

describe("removed assertions", () => {
  const tasks = [
    task("T1", "done", {
      removedAssertions: [
        { path: "src/a.test.ts", removed: 2 },
        { path: "src/b.test.ts", removed: 1 },
      ],
    }),
    task("T2", "done"),
  ];

  it("are one line per task and test, in both languages", () => {
    expect(assertionWarnings(tasks, "es")).toEqual([
      "T1 quitó 2 aserciones de src/a.test.ts, un test que ya existía.",
      "T1 quitó 1 aserción de src/b.test.ts, un test que ya existía.",
    ]);
    expect(assertionWarnings(tasks, "en")[1]).toBe(
      "T1 removed 1 assertion from src/b.test.ts, a test that already existed.",
    );
    expect(assertionWarnings([task("T2", "done")], "es")).toEqual([]);
  });

  it("show in the acceptance card, for the agent to tell the user", () => {
    expect(card("acceptance", tasks)).toContain(
      "AVISOS:\n  T1 quitó 2 aserciones de src/a.test.ts, un test que ya existía.\n  T1 quitó 1 aserción de src/b.test.ts, un test que ya existía.\n  Cuéntaselo al usuario antes de que acepte: un test debilitado puede ocultar un fallo.",
    );
    expect(card("acceptance", [task("T1", "done")])).not.toContain("AVISOS:");
  });
});
