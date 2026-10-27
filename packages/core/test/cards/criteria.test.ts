// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  acceptanceSummary,
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  type TaskView,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

type CriterionTests = NonNullable<ChangeView["criteriaTests"]>[number];

const T1: TaskView = {
  id: "T1",
  title: "Saludo",
  status: "done",
  files: ["src/app.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  summary: "Saluda por nombre",
  commit: "a1b2c3d",
};

const TESTED: CriterionTests = {
  id: "AC1",
  manual: false,
  owed: true,
  tests: [
    { path: "src/app.test.ts", line: 3, task: "T1", commit: "a1b2c3d" },
    { path: "src/name.test.ts", line: 12, task: "T2", commit: "e4f5a6b" },
  ],
};
const MANUAL: CriterionTests = { id: "AC2", manual: true, owed: true, tests: [] };
const UNTESTED: CriterionTests = { id: "AC3", manual: false, owed: true, tests: [] };
/** Only a `refactor` task covers it: it owes no test. */
const REFACTORED: CriterionTests = { id: "AC4", manual: false, owed: false, tests: [] };

const change = (criteriaTests?: readonly CriterionTests[]): ChangeView => ({
  id: "20261027-saludo",
  kind: "standard",
  phase: "acceptance",
  title: "Saludo",
  specPath: ".specty/changes/20261027-saludo/spec.md",
  revision: 1,
  tasks: [T1],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...(criteriaTests === undefined ? {} : { criteriaTests }),
});

const card = (view: ChangeView, ctx = ES) =>
  renderText(nextCard({ change: view, dirty: [] }, ctx), ctx.lang);

const ALL = [TESTED, MANUAL, UNTESTED, REFACTORED];

describe("criteria and their tests in acceptance", () => {
  it("AC5: show each criterion with the file, line, task and commit of its tests", () => {
    expect(card(change(ALL))).toContain(
      [
        "CRITERIOS Y TESTS:",
        "  AC1: src/app.test.ts:3 (T1, a1b2c3d), src/name.test.ts:12 (T2, e4f5a6b)",
        "  AC2: a mano (test: manual)",
        "  AC3: sin test",
        "  AC4: sin test",
      ].join("\n"),
    );
    expect(card(change(ALL), EN)).toContain(
      "CRITERIA AND TESTS:\n  AC1: src/app.test.ts:3 (T1, a1b2c3d), src/name.test.ts:12 (T2, e4f5a6b)\n  AC2: by hand (test: manual)\n  AC3: no test\n",
    );
    expect(card(change())).not.toContain("CRITERIOS Y TESTS");
  });

  it("AC6: warn the agent about a manual criterion and one that lacks its test", () => {
    expect(card(change(ALL))).toContain(
      [
        "AVISOS:",
        "  A comprobar a mano (test: manual): AC2.",
        "  Pide al usuario que los compruebe antes de aceptar.",
        "  Sin un test con su id, aunque los cubre una tarea feat o fix: AC3.",
        "  Cuéntaselo al usuario antes de que acepte: ningún test comprueba esos criterios.",
      ].join("\n"),
    );
    expect(card(change([TESTED, REFACTORED]))).not.toContain("AVISOS:");
  });

  it("AC6: name them to the person before accepting", () => {
    expect(acceptanceSummary(change(ALL), false, EN).split("\n")).toEqual([
      "T1 Saluda por nombre (a1b2c3d)",
      "To check by hand (test: manual): AC2.",
      "No test with their id, though a feat or fix task covers them: AC3.",
    ]);
    expect(acceptanceSummary(change([TESTED]), false, ES)).toBe("T1 Saluda por nombre (a1b2c3d)");
  });
});
