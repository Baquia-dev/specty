// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  adjustRefusalCard,
  type CardContext,
  type ChangeView,
  nextCard,
  renderText,
  type TaskView,
  verifyFailedCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · acceptance";

describe("the cards of a refused `adjust`", () => {
  it("are invalid without the user's request, and say how to pass it", () => {
    const card = adjustRefusalCard({ reason: "no-request" }, HEADER, ES);
    expect(card.status).toBe("invalid");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "Falta la petición del usuario.",
        'SIGUIENTE: ejecuta `specty adjust "<petición literal>"`.',
      ].join("\n"),
    );
    expect(adjustRefusalCard({ reason: "no-request" }, HEADER, EN).next).toBe(
      'run `specty adjust "<literal request>"`.',
    );
  });

  it("AC1: send the agent to `next` outside the implementation and the acceptance, naming both", () => {
    const card = adjustRefusalCard({ reason: "not-in-acceptance" }, HEADER, EN);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "en")).toBe(
      [
        HEADER,
        "Adjustments are requested while its tasks are implemented or with the result in acceptance.",
        "NEXT: run `specty next`.",
      ].join("\n"),
    );
    expect(renderText(adjustRefusalCard({ reason: "not-in-acceptance" }, HEADER, ES), "es")).toBe(
      [
        HEADER,
        "Los ajustes se piden mientras se implementan sus tareas o con el resultado en aceptación.",
        "SIGUIENTE: ejecuta `specty next`.",
      ].join("\n"),
    );
  });

  it("AC4: name both phases of an epic's adjustments", () => {
    const epic = "SPECTY · 20261105-bandeja · review";
    const card = adjustRefusalCard({ reason: "not-in-acceptance", epic: true }, epic, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        epic,
        "Los ajustes de una épica se piden mientras se implementan sus cortes o con el resultado en aceptación.",
        "SIGUIENTE: ejecuta `specty next`.",
      ].join("\n"),
    );
    expect(
      renderText(adjustRefusalCard({ reason: "not-in-acceptance", epic: true }, epic, EN), "en"),
    ).toBe(
      [
        epic,
        "An epic's adjustments are requested while its slices are implemented or with the result in acceptance.",
        "NEXT: run `specty next`.",
      ].join("\n"),
    );
  });

  it("send the agent to finish a merge still in progress first", () => {
    const card = adjustRefusalCard({ reason: "merging", target: "main" }, HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "El merge de main sigue en curso en esta carpeta: los ajustes se piden cuando termine.",
        "SIGUIENTE: termina la incorporación con `specty integrate` (`specty next` te dice qué falta) y vuelve a ejecutar `specty adjust`.",
      ].join("\n"),
    );
    expect(
      renderText(adjustRefusalCard({ reason: "merging", target: "main" }, HEADER, EN), "en"),
    ).toBe(
      [
        HEADER,
        "The merge of main is still in progress in this folder: adjustments are requested once it is done.",
        "NEXT: finish the incorporation with `specty integrate` (`specty next` says what is missing) and run `specty adjust` again.",
      ].join("\n"),
    );
  });
});

const task = (id: string, status: TaskView["status"]): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status,
  files: ["src/app.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  verify: "pnpm exec vitest run src/app.test.ts",
});

/** A change adjusted while T2 was implemented: its verification loads no test. */
const MIDWAY: ChangeView = {
  id: "20261107-x",
  kind: "standard",
  phase: "adjusting",
  title: "X",
  specPath: ".specty/changes/20261107-x/spec.md",
  revision: 1,
  tasks: [task("T1", "done"), task("T2", "active"), task("T3", "pending")],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  adjustment: "La verify de T2 usa vitest, pero la UI carga sus tests con ng test",
  pendingTasksOnly: true,
};

describe("the cards of an adjustment while the tasks are implemented", () => {
  const adjusting = (ctx: CardContext, change = MIDWAY) =>
    renderText(nextCard({ change, dirty: [] }, ctx), ctx.lang);

  it("AC1: ask to correct only the pending tasks, instead of classifying the request", () => {
    const es = adjusting(ES);
    expect(es).toContain(
      "PETICIÓN:\n  La verify de T2 usa vitest, pero la UI carga sus tests con ng test",
    );
    expect(es).toContain(
      [
        "CÓMO CORREGIRLAS:",
        "  Mientras se implementa, el ajuste solo corrige las tareas pendientes: su `verify` (por ejemplo, una que no carga ni ejecuta sus tests), sus `files` o su texto.",
        "  No añadas ni borres tareas ni cambies los criterios: eso se pide con el resultado en aceptación.",
        "  No modifiques las tareas completadas. Al aprobarse el ajuste, la tarea activa sigue donde estaba, con su trabajo.",
      ].join("\n"),
    );
    expect(es).not.toContain("type: fix");
    expect(es).toContain(
      "SIGUIENTE: edita .specty/changes/20261107-x/spec.md y ejecuta `specty propose`.",
    );
    const en = adjusting(EN);
    expect(en).toContain(
      [
        "HOW TO CORRECT THEM:",
        "  While the change is implemented, the adjustment only corrects the pending tasks: their `verify` (for instance, one that does not load or run their tests), their `files` or their text.",
        "  Do not add or remove tasks or change the criteria: that is asked for with the result in acceptance.",
        "  Do not modify done tasks. Once the adjustment is approved, the active task goes on where it was, with its work.",
      ].join("\n"),
    );
    // With every task done, the request came in acceptance: it is classified as always.
    const accepted = {
      ...MIDWAY,
      pendingTasksOnly: false,
      tasks: [task("T1", "done"), task("T2", "done")],
    };
    const classified = adjusting(ES, accepted);
    expect(classified).toContain("CÓMO CLASIFICARLA:");
    expect(classified).not.toContain("CÓMO CORREGIRLAS:");
  });

  it("AC1: ask to correct the pending tasks before `next` activates one, right after the approval", () => {
    const unstarted = {
      ...MIDWAY,
      tasks: [task("T1", "done"), task("T2", "pending"), task("T3", "pending")],
    };
    const es = adjusting(ES, unstarted);
    expect(es).toContain("CÓMO CORREGIRLAS:");
    expect(es).not.toContain("CÓMO CLASIFICARLA:");
    expect(adjusting(EN, unstarted)).toContain("HOW TO CORRECT THEM:");
  });

  it("AC2: classify a request of the acceptance, also once the spec adds a task still to do", () => {
    const accepted = {
      ...MIDWAY,
      pendingTasksOnly: false,
      tasks: [task("T1", "done"), task("T2", "done"), task("T3", "pending")],
    };
    const es = adjusting(ES, accepted);
    expect(es).toContain("CÓMO CLASIFICARLA:");
    expect(es).not.toContain("CÓMO CORREGIRLAS:");
  });

  it("AC4: the failed verification of `task done` names the adjustment of a wrong `verify`", () => {
    const failed = (ctx: CardContext) =>
      verifyFailedCard(HEADER, "T2", "pnpm exec vitest run", 1, ["No test files found"], ctx).next;
    expect(failed(ES)).toBe(
      'corrige el problema y vuelve a ejecutar `specty task done T2 --summary "<qué hiciste>"`; si lo que está mal es la propia `verify` de la tarea (no carga ni ejecuta sus tests), corrígela antes con `specty adjust "<qué corregir y por qué>"`.',
    );
    expect(failed(EN)).toBe(
      'fix the problem and run `specty task done T2 --summary "<what you did>"` again; if what is wrong is the task\'s own `verify` (it does not load or run its tests), correct it first with `specty adjust "<what to correct and why>"`.',
    );
  });
});
