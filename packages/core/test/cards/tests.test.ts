// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  assertionWarnings,
  type CardContext,
  type ChangeView,
  longFileCard,
  longFileWarnings,
  nextCard,
  renderText,
  riskWarnings,
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

  it("AC4: show in the task card: test first, with the criterion's id, and never bend an existing failing test", () => {
    const first = card("implementing", [task("T1", "active", { testRules: "first" })]);
    expect(first).toContain(
      "TESTS:\n  Primero el test: escribe el que comprueba cada criterio, con su id en el nombre (`AC1: …`), y míralo fallar; después, el código.\n  Si falla un test que ya existía, no lo cambies para que pase: para y explícaselo al usuario.",
    );
    expect(
      card("implementing", [task("T1", "active", { testRules: "first" })], { ...ES, lang: "en" }),
    ).toContain(
      "TESTS:\n  Test first: write the test that checks each criterion, with its id in the name (`AC1: …`), and watch it fail; then the code.\n",
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

describe("content risks", () => {
  const tasks = [
    task("T1", "done", {
      risks: [
        { path: "src/api.ts", line: 13, rule: "tls-disabled", cwe: "CWE-295" },
        { path: "scripts/run.sh", rule: "executable" },
      ],
    }),
    task("T2", "done", { removedAssertions: [{ path: "src/a.test.ts", removed: 1 }] }),
  ];

  it("are one line per finding, with its line and CWE, in both languages", () => {
    expect(riskWarnings(tasks, "es")).toEqual([
      "T1: src/api.ts:13 desactiva la verificación TLS (CWE-295).",
      "T1: scripts/run.sh pasa a ser ejecutable.",
    ]);
    expect(riskWarnings(tasks, "en")[0]).toBe(
      "T1: src/api.ts:13 disables TLS verification (CWE-295).",
    );
  });

  it("show in the acceptance card after the removed assertions", () => {
    expect(card("acceptance", tasks)).toContain(
      "AVISOS:\n  T2 quitó 1 aserción de src/a.test.ts, un test que ya existía.\n  Cuéntaselo al usuario antes de que acepte: un test debilitado puede ocultar un fallo.\n  T1: src/api.ts:13 desactiva la verificación TLS (CWE-295).\n  T1: scripts/run.sh pasa a ser ejecutable.\n  Revísalo con el usuario antes de que acepte: son patrones de riesgo conocidos, no fallos seguros.",
    );
  });
});

describe("long files", () => {
  const long = {
    path: "src/a.ts",
    lines: 320,
    before: 250,
    limit: 300,
    severity: "warning" as const,
  };
  const tasks = [task("T1", "done", { longFiles: [long] })];

  it("are one line per file, in both languages", () => {
    expect(longFileWarnings(tasks, "es")).toEqual([
      "T1: src/a.ts, 320 líneas de código (aviso a partir de 300).",
    ]);
    expect(longFileWarnings(tasks, "en")).toEqual([
      "T1: src/a.ts, 320 lines of code (warning past 300).",
    ]);
  });

  it("show in the acceptance card, with the advice not to split for the number", () => {
    expect(card("acceptance", tasks)).toContain(
      "AVISOS:\n  T1: src/a.ts, 320 líneas de código (aviso a partir de 300).\n  Si un archivo mezcla responsabilidades, propón cómo dividirlo antes de seguir; nunca lo partas solo para cumplir el número.",
    );
  });

  it("block a task that takes a file past the maximum, naming the way on", () => {
    const blocked = longFileCard(
      "SPECTY · 20261024-x · implementing",
      "T1",
      [{ ...long, lines: 520, limit: 500, severity: "error" }],
      ES,
    );
    expect(blocked.status).toBe("blocked");
    expect(renderText(blocked, "es")).toContain(
      "ARCHIVOS DEMASIADO LARGOS:\n  src/a.ts: 520 líneas de código (máximo 500)",
    );
    expect(blocked.next).toBe(
      'divide esos archivos por responsabilidad (pide con `specty scope add` los archivos nuevos que necesites) y vuelve a ejecutar `specty task done T1 --summary "<qué hiciste>"`; si de verdad son una sola responsabilidad, explícaselo al usuario, que puede cambiar `lines.fail` en .specty/config.yaml.',
    );
  });
});
