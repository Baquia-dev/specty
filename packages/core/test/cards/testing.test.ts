// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  statusCard,
  type TaskView,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status: "pending",
  files: ["src/greet.ts", "test/greet.test.ts"],
  extras: [],
  criteria: [{ id: "AC1", text: "CUANDO hay nombre ENTONCES saluda por nombre." }],
  effort: "medium",
  testRules: "first",
  ...extra,
});

const change = (tasks: TaskView[]): ChangeView => ({
  id: "20261028-saludo",
  kind: "standard",
  phase: "testing",
  title: "Saludo",
  specPath: ".specty/changes/20261028-saludo/spec.md",
  revision: 1,
  tasks,
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
});

const card = (tasks: TaskView[], ctx = ES) =>
  renderText(nextCard({ change: change(tasks), dirty: [] }, ctx), ctx.lang);

describe("the card of the testing phase", () => {
  it("AC2: asks for a test per criterion first, only tests, and to send them with propose", () => {
    const text = card([
      task("T1"),
      task("T2", {
        criteria: [
          { id: "AC1", text: "CUANDO hay nombre ENTONCES saluda por nombre." },
          { id: "AC2", text: "CUANDO no hay nombre ENTONCES saluda sin él." },
        ],
      }),
      task("T3", {
        files: ["src/format.ts"],
        criteria: [{ id: "AC3", text: "CUANDO se reordena ENTONCES saluda igual." }],
        testRules: "keep",
      }),
    ]);
    expect(text).toContain("SPECTY · 20261028-saludo · testing");
    expect(text).toContain("CRITERIOS");
    expect(text.match(/AC1: CUANDO hay nombre/g)).toHaveLength(1);
    expect(text).toContain("AC2: CUANDO no hay nombre ENTONCES saluda sin él.");
    expect(text).not.toContain("AC3");
    expect(text).toContain("test/greet.test.ts");
    expect(text).not.toContain("src/greet.ts");
    expect(text).toContain("+ tests junto a los archivos del cambio");
    expect(text).toContain("con su id en el nombre (`AC1: …`)");
    expect(text).toContain("ni código de producción ni sus firmas");
    expect(text).toMatch(/SIGUIENTE: .*`specty propose`/);
  });

  it("AC2: says it in English too", () => {
    const text = card([task("T1")], EN);
    expect(text).toContain("CRITERIA");
    expect(text).toContain("with its id in the name (`AC1: …`)");
    expect(text).toContain("neither production code nor its signatures");
    expect(text).toMatch(/NEXT: .*`specty propose`/);
  });
});

describe("the person's decision on the tests", () => {
  it("AC5: names `approve` as what the person owes once the tests are sent", () => {
    const card = statusCard(
      [
        {
          id: "20261028-saludo",
          kind: "standard",
          phase: "testing",
          title: "Saludo",
          waitingFor: "human",
          current: true,
          pendingScope: [],
        },
      ],
      ES,
    );
    expect(card.next).toBe("te toca decidir en 20261028-saludo: `specty approve`.");
  });
});
