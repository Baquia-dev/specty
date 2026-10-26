// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  acceptAnywayQuestion,
  acceptanceSummary,
  acceptedLine,
  acceptQuestion,
  type CardContext,
  type ChangeView,
  delegatedFailureCard,
  quickClosedLine,
  quickClosing,
  renderText,
  runVerificationQuestion,
  type TaskView,
  verificationNoteTitle,
  verificationReusedNote,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const task = (id: string, extra: Partial<TaskView> = {}): TaskView => ({
  id,
  title: `Tarea ${id}`,
  status: "done",
  files: ["src/a.ts"],
  extras: [],
  criteria: [],
  effort: "medium",
  ...extra,
});

const change = (tasks: TaskView[], extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261020-saludo",
  kind: "standard",
  phase: "acceptance",
  title: "Saludo",
  specPath: ".specty/changes/20261020-saludo/spec.md",
  revision: 1,
  tasks,
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...extra,
});

describe("what the person sees before accepting", () => {
  it("lists each task's summary and commit, and its warnings", () => {
    const tasks = [
      task("T1", { summary: "Saluda por nombre", commit: "a1b2c3d" }),
      task("T2", { removedAssertions: [{ path: "test/a.test.ts", removed: 1 }] }),
    ];
    expect(acceptanceSummary(change(tasks), false, ES).split("\n")).toEqual([
      "T1 Saluda por nombre (a1b2c3d)",
      "T2 Tarea T2",
      "T2 quitó 1 aserción de test/a.test.ts, un test que ya existía.",
    ]);
  });

  it("says when nothing verifies the whole change", () => {
    expect(acceptanceSummary(change([task("T1")]), true, EN).split("\n")).toEqual([
      "T1 Tarea T1",
      "Nothing verifies the whole change: .specty/config.yaml has neither `verify.full` nor `verify.default`, so only each task's `verify` ran.",
    ]);
  });

  it("lists an epic's slices", () => {
    const epic = change([], {
      kind: "epic",
      slices: [
        {
          id: "C1",
          title: "Core",
          depends: [],
          status: "done",
          child: { id: "20261020-core", phase: "done" },
        },
      ],
    });
    expect(acceptanceSummary(epic, false, ES)).toContain("C1 Core");
  });
});

describe("the full verification before accepting", () => {
  it("is not repeated on the same code, and says where it passed", () => {
    expect(verificationReusedNote("pnpm check", "T2", "es")).toEqual({
      title: "Verificación completa",
      text: "La verificación completa (`pnpm check`) ya pasó con este mismo código en T2: no se repite.",
    });
    expect(verificationReusedNote("pnpm check", undefined, "en").text).toBe(
      "The full verification (`pnpm check`) already passed on this same code in an earlier run: it does not run again.",
    );
  });

  it("is offered, shown and, in delegated mode, required to pass", () => {
    expect(runVerificationQuestion("pnpm check", "es")).toBe(
      "¿Ejecutar antes la verificación completa (`pnpm check`)?",
    );
    expect(verificationNoteTitle(true, "es")).toBe("Verificación correcta");
    expect(verificationNoteTitle(false, "en")).toBe("Verification failed");
    const failed = delegatedFailureCard("SPECTY · 20261020-saludo · acceptance", "pnpm check", ES);
    expect(failed.status).toBe("blocked");
    expect(renderText(failed, "es")).toBe(
      [
        "SPECTY · 20261020-saludo · acceptance",
        "La verificación completa (`pnpm check`) falló: en modo delegado no se acepta.",
        'SIGUIENTE: corrige el fallo: ejecuta `specty adjust "<qué falla>"` y sigue su salida.',
      ].join("\n"),
    );
    expect(acceptAnywayQuestion("en")).toBe("Accept anyway?");
  });
});

describe("the acceptance", () => {
  it("asks, and says what comes next", () => {
    expect(acceptQuestion("Saludo", "es")).toBe("¿Aceptar el resultado de «Saludo»?");
    expect(acceptQuestion("Greeting", "en")).toBe('Accept the result of "Greeting"?');
    expect(acceptedLine("es")).toBe("Resultado aceptado; el agente redactará el cierre.");
  });

  it("of a quick change writes its closing and archives it", () => {
    expect(quickClosing(["Saluda por nombre"], "es")).toBe("### Resumen\n\nSaluda por nombre");
    expect(quickClosing(["a", "b"], "en")).toBe("### Summary\n\na\nb");
    expect(quickClosedLine("a1b2c3d", "en")).toBe(
      "Change accepted, closed and archived (commit a1b2c3d).",
    );
  });
});
