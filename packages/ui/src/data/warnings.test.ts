// SPDX-License-Identifier: Apache-2.0
import { sampleRecords } from "./fixtures";
import type { AuditRecord } from "./progress";
import { deriveViews } from "./views";
import { warningsOf } from "./warnings";

const completed = (task: string, data: Readonly<Record<string, unknown>>): AuditRecord => ({
  ts: "2026-10-24T10:00:00Z",
  actor: "agent",
  event: "task.completed",
  data: { task, ...data },
});

describe("warningsOf", () => {
  it("gives each task's risks and removed assertions, in both languages (AC1)", () => {
    const warnings = warningsOf([
      completed("T1", {
        risks: [
          { path: "src/api.ts", rule: "tls-disabled", cwe: "CWE-295", line: 7 },
          { path: "src/other.ts", rule: "made-up" },
          "not a risk",
        ],
      }),
      completed("T2", { removedAssertions: [{ path: "test/app.test.ts", removed: 2 }] }),
      completed("T3", { removedAssertions: [{ path: "test/one.test.ts", removed: 1 }, {}] }),
    ]);
    expect(
      warnings.map(({ task, kind, path, line, cwe }) => [task, kind, path, line, cwe]),
    ).toEqual([
      ["T1", "risk", "src/api.ts", 7, "CWE-295"],
      ["T2", "assertions", "test/app.test.ts", undefined, undefined],
      ["T3", "assertions", "test/one.test.ts", undefined, undefined],
    ]);
    expect(warnings[0]?.text.es).toBeTruthy();
    expect(warnings[0]?.text.en).not.toBe(warnings[0]?.text.es);
    expect(warnings[1]?.text).toEqual({
      es: "quitó 2 aserciones de un test que ya existía",
      en: "removed 2 assertions from a test that already existed",
    });
    expect(warnings[2]?.text.es).toBe("quitó 1 aserción de un test que ya existía");
  });

  it("counts only each task's last completion (AC1)", () => {
    const first = completed("T1", { removedAssertions: [{ path: "test/a.test.ts", removed: 1 }] });
    expect(warningsOf([first, completed("T1", {})])).toEqual([]);
    expect(warningsOf([])).toEqual([]);
  });

  it("reaches the view, and the sample change in acceptance has some (AC1, AC3)", () => {
    const views = deriveViews(sampleRecords(Date.now()));
    const accepting = views.find((view) => view.id === "20261018-asistencia-curso");
    expect(accepting?.warnings?.map(({ task, kind }) => [task, kind])).toEqual([
      ["T1", "risk"],
      ["T2", "assertions"],
    ]);
    expect(views.find((view) => view.id === "20261021-modo-oscuro")?.warnings).toBeUndefined();
  });
});
