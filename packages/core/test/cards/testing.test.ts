// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  approveTestsQuestion,
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  statusCard,
  type TaskView,
  testsApprovedLine,
  testsRefusedCard,
  testsSubmittedCard,
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

  it("AC6: leaves out the criteria checked by hand", () => {
    const text = card([
      task("T1", {
        criteria: [
          { id: "AC1", text: "CUANDO hay nombre ENTONCES saluda por nombre." },
          { id: "AC2", text: "CUANDO se lee la guía ENTONCES explica el saludo.", manual: true },
        ],
      }),
    ]);
    expect(text).toContain("AC1: CUANDO hay nombre");
    expect(text).not.toContain("AC2");
  });
});

describe("the tests not sent", () => {
  const refused = (refusal: Parameters<typeof testsRefusedCard>[1], ctx = ES) =>
    renderText(testsRefusedCard("20261028-saludo", refusal, ctx), ctx.lang);

  it("AC1: says the tests are not red when the verification passes", () => {
    expect(refused({ reason: "green", commands: ["pnpm test"] })).toContain(
      "Los tests nuevos no fallan: pasó su verificación:\n  pnpm test\nSIGUIENTE: escribe los tests de modo que fallen sin el código y vuelve a ejecutar `specty propose`.",
    );
    expect(refused({ reason: "green", commands: ["pnpm test"] }, EN)).toContain(
      "The new tests do not fail: their verification passed:\n  pnpm test",
    );
  });

  it("AC2: names the new tests the failing verification does not name", () => {
    expect(refused({ reason: "unnamed", paths: ["src/b.test.ts"] })).toContain(
      "La verificación falla, pero su salida no nombra estos tests nuevos:\n  src/b.test.ts",
    );
  });

  it("AC3: names the criteria without a new test that carries their id", () => {
    const text = refused({ reason: "untested", criteria: ["AC2", "AC3"] });
    expect(text).toContain("Estos criterios no tienen un test nuevo con su id:\n  AC2\n  AC3");
    expect(text).toContain("con su id en el nombre (`AC1: …`)");
  });
});

describe("the tests sent", () => {
  const sent = { commit: "abc1234", files: ["src/app.test.ts", "src/greet.test.ts"] };

  it("AC1: says what was committed and asks the user to approve it", () => {
    const text = renderText(testsSubmittedCard("20261028-saludo", sent, ES), "es");
    expect(text).toContain("SPECTY · 20261028-saludo · testing");
    expect(text).toContain(
      "TESTS ENVIADOS (commit abc1234):\n  src/app.test.ts\n  src/greet.test.ts",
    );
    expect(text).toContain(
      "SIGUIENTE: pide al usuario que revise los tests y los apruebe con `specty approve`, y termina tu turno.",
    );
    const delegated = renderText(
      testsSubmittedCard("20261028-saludo", sent, { ...EN, delegated: true }),
      "en",
    );
    expect(delegated).toContain("TESTS SENT (commit abc1234)");
    expect(delegated).toContain(
      "NEXT: delegated mode: approve the tests yourself with `specty approve` and follow its output.",
    );
  });

  it("AC1: keeps the change waiting for the person on `next`", () => {
    expect(card([task("T1")])).not.toContain("Tests enviados");
    const waiting = renderText(
      nextCard({ change: { ...change([task("T1")]), testsSubmitted: true }, dirty: [] }, ES),
      "es",
    );
    expect(waiting).toContain("Tests enviados; falta la aprobación del usuario.");
    expect(waiting).toContain("`specty approve`");
  });

  it("AC2: says why nothing was sent: no new tests, or code changed with them", () => {
    const none = testsRefusedCard("20261028-saludo", { reason: "no-tests" }, ES);
    expect(none.status).toBe("blocked");
    expect(renderText(none, "es")).toContain(
      "No hay tests nuevos de los archivos del cambio que enviar.\nSIGUIENTE: escribe los tests de los criterios y vuelve a ejecutar `specty propose`.",
    );
    const code = testsRefusedCard("20261028-saludo", { reason: "code", paths: ["src/app.ts"] }, EN);
    expect(renderText(code, "en")).toContain(
      "In the testing phase only tests are sent; this code changed:\n  src/app.ts",
    );
  });

  it("AC3: asks the person and records the approval in both languages", () => {
    expect(approveTestsQuestion("Saludo", "es")).toBe("¿Aprobar los tests de «Saludo»?");
    expect(approveTestsQuestion("Saludo", "en")).toBe('Approve the tests of "Saludo"?');
    expect(testsApprovedLine("abc1234", "es")).toBe("Tests aprobados (commit abc1234).");
    expect(testsApprovedLine("abc1234", "en")).toBe("Tests approved (commit abc1234).");
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
