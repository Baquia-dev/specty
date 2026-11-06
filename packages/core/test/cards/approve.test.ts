// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  approvalPostponedCard,
  approvalSummary,
  approveSpecQuestion,
  askAgentNext,
  assumptionChoices,
  type CardContext,
  computeSize,
  DEFAULT_CONFIG,
  deltaLine,
  effortLine,
  formatSizeReason,
  noScopeRequestCard,
  recommendEffort,
  rejectedAssumptionsLine,
  rejectionQuestion,
  renderText,
  scopeDecidedLine,
  scopeDecisionQuestion,
  scopeRequestNote,
  specApprovedLine,
  specChangedCard,
} from "../../src";
import { fixture, specOf } from "../helpers";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · review · revisión 2";

describe("the approval of a spec", () => {
  it("refuses a spec that changed since it was proposed", () => {
    const card = specChangedCard(HEADER, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        HEADER,
        "La spec cambió desde la última propuesta.",
        "SIGUIENTE: pídele a tu agente que ejecute `specty propose`.",
      ].join("\n"),
    );
    expect(specChangedCard(HEADER, EN).next).toBe("ask your agent to run `specty propose`.");
  });

  it("sums up the revision, its size and effort, what changed and its warnings", () => {
    const size = computeSize(specOf(fixture("standard.es.md")), DEFAULT_CONFIG);
    const effort = recommendEffort(size.level);
    const added = { key: "T3", kind: "task", change: "added" } as const;
    const summary = approvalSummary(
      {
        specPath: ".specty/changes/20261020-saludo/spec.md",
        revision: 2,
        size,
        effort,
        delta: [added],
        diagnostics: [
          { code: "task-no-tests", severity: "warning", message: "T3 no incluye tests." },
        ],
        shared: ["src/a.ts (también en 20261020-otro)"],
      },
      ES,
    );
    const reasons = size.reasons.map((reason) => formatSizeReason(reason, "es")).join(", ");
    expect(summary.split("\n")).toEqual([
      ".specty/changes/20261020-saludo/spec.md · revisión 2",
      `Tamaño ${size.level}: ${reasons}`,
      effortLine(effort, ES),
      `Δ ${deltaLine(added, ES)}`,
      "! T3 no incluye tests.",
      "! Compartido: src/a.ts (también en 20261020-otro)",
    ]);
    const english = approvalSummary(
      { specPath: "spec.md", revision: 1, size, effort, delta: [], diagnostics: [], shared: ["x"] },
      EN,
    );
    expect(english).toMatch(/^spec\.md · revision 1\nSize /);
    expect(english).toMatch(/\n! Shared: x$/);
  });

  it("asks about high-impact assumptions and why one is rejected", () => {
    expect(assumptionChoices("es")).toEqual([
      { value: "confirm", label: "Confirmar" },
      { value: "reject", label: "Rechazar" },
    ]);
    expect(assumptionChoices("en").map((choice) => choice.label)).toEqual(["Confirm", "Reject"]);
    expect(rejectionQuestion("assumption", "es")).toBe("¿Por qué? (lo leerá el agente)");
    expect(rejectionQuestion("scope", "en")).toBe("Why do you reject it? (the agent will read it)");
    expect(rejectedAssumptionsLine(["A1", "A3"], "es")).toBe(
      "Rechazaste A1, A3; el agente debe corregir la spec.",
    );
    expect(rejectedAssumptionsLine(["A2"], "en")).toBe(
      "You rejected A2; the agent must fix the spec.",
    );
  });

  it("asks for the approval, says what it committed, or that nothing changed", () => {
    expect(approveSpecQuestion(2, "Saludo", "es")).toBe("¿Aprobar la revisión 2 de «Saludo»?");
    expect(approveSpecQuestion(2, "Greeting", "en")).toBe('Approve revision 2 of "Greeting"?');
    expect(askAgentNext(ES)).toBe("pídele a tu agente `specty next`.");
    expect(specApprovedLine(2, "a1b2c3d", "en")).toBe("Revision 2 approved (commit a1b2c3d).");
    const postponed = approvalPostponedCard(HEADER, ES);
    expect(postponed.status).toBe("ok");
    expect(renderText(postponed, "es")).toBe(
      [
        HEADER,
        "Aprobación pospuesta; nada cambió.",
        "SIGUIENTE: cuando estés listo, ejecuta `specty approve`.",
      ].join("\n"),
    );
  });
});

describe("the decision on a scope request", () => {
  const request = { id: "S1", task: "T2", paths: ["src/a.ts", "src/b.ts"] };

  it("refuses a request the change does not have", () => {
    const card = noScopeRequestCard("S9", "SPECTY · 20261020-saludo · implementing", EN);
    expect(renderText(card, "en")).toBe(
      "SPECTY · 20261020-saludo · implementing\nThere is no request S9.\nNEXT: check `specty status`.",
    );
  });

  it("asks before deciding and says what was decided", () => {
    expect(scopeDecisionQuestion("approve", request, "es")).toBe("¿Aprobar S1 para T2?");
    expect(scopeDecisionQuestion("reject", request, "en")).toBe("Reject S1?");
    expect(scopeDecidedLine("approve", request, "es")).toBe(
      "S1 aprobada: src/a.ts, src/b.ts entra en el alcance de T2.",
    );
    expect(scopeDecidedLine("reject", request, "en")).toBe("S1 rejected.");
  });
});

describe("the note before deciding on a scope request", () => {
  const asked = {
    id: "S1",
    task: "T1",
    paths: ["src/app.test.ts"],
    reason: "El test no comprueba el saludo",
  };
  /** The change an unlock asks to make to the test, as `git diff` writes it. */
  const PATCH = [
    "diff --git a/src/app.test.ts b/src/app.test.ts",
    "--- a/src/app.test.ts",
    "+++ b/src/app.test.ts",
    "@@ -1 +1 @@",
    "-it('AC1: saluda a Ana', () => {});",
    "+it('AC1: saluda a Ana', () => {}); // Hola, Ana",
    "",
  ].join("\n");
  const unlock = {
    ...asked,
    patch: PATCH,
    evidence: [
      {
        path: "src/app.ts",
        from: 9,
        to: 10,
        text: "export const greet = (name) =>\n  'Hola, ' + name;",
      },
      { path: "SPEC.md", from: 3, to: 3, text: "- AC1: saluda con «Hola, Ana»" },
    ],
  };

  it("AC3: is the paths and the reason of a request without a patch or evidence", () => {
    expect(scopeRequestNote({ ...asked, paths: ["src/a.ts", "src/b.ts"] }, ES)).toBe(
      "src/a.ts\nsrc/b.ts\n— El test no comprueba el saludo",
    );
  });

  it("AC1: shows the patch and each piece of evidence with its path and its numbered lines", () => {
    expect(scopeRequestNote(unlock, ES)).toBe(
      [
        "src/app.test.ts",
        "— El test no comprueba el saludo",
        "",
        "El cambio al test:",
        ...PATCH.split("\n").slice(0, -1),
        "",
        "El código que lo sustenta:",
        "src/app.ts:9-10",
        " 9 │ export const greet = (name) =>",
        "10 │   'Hola, ' + name;",
        "SPEC.md:3-3",
        "3 │ - AC1: saluda con «Hola, Ana»",
      ].join("\n"),
    );
    const english = scopeRequestNote(unlock, EN);
    expect(english).toContain("\n\nThe change to the test:\ndiff --git a/src/app.test.ts");
    expect(english).toContain("\n\nThe code that supports it:\nsrc/app.ts:9-10\n 9 │ export");
  });

  it("AC2: shows the first 40 lines of the patch and 10 of each piece, and says how many it leaves out", () => {
    const patch = [
      "diff --git a/src/app.test.ts b/src/app.test.ts",
      "--- a/src/app.test.ts",
      "+++ b/src/app.test.ts",
      "@@ -0,0 +1,42 @@",
      ...Array.from({ length: 42 }, (_, index) => `+línea ${index + 1}`),
    ];
    const code = Array.from({ length: 13 }, (_, index) => `código ${95 + index}`);
    const long = {
      ...asked,
      patch: `${patch.join("\n")}\n`,
      evidence: [{ path: "src/app.ts", from: 95, to: 107, text: code.join("\n") }],
    };
    expect(scopeRequestNote(long, ES)).toBe(
      [
        "src/app.test.ts",
        "— El test no comprueba el saludo",
        "",
        "El cambio al test:",
        ...patch.slice(0, 40),
        "… y 6 líneas más",
        "",
        "El código que lo sustenta:",
        "src/app.ts:95-107",
        ...code.slice(0, 10).map((line, index) => `${String(95 + index).padStart(3)} │ ${line}`),
        "… y 3 líneas más",
        "",
        "La solicitud entera se ve en la UI: `specty ui`.",
      ].join("\n"),
    );
    const english = scopeRequestNote(long, EN);
    expect(english).toContain("\n… and 6 more lines\n");
    expect(english).toContain("\n… and 3 more lines\n");
    expect(english).toContain("\n\nThe whole request shows in the UI: `specty ui`.");
  });

  it("AC4: shows control and direction characters by their code instead of letting them act", () => {
    const tricky = {
      ...asked,
      reason: "Motivo\u001b[2K",
      patch:
        "diff --git a/src/app.test.ts b/src/app.test.ts\r\n+oculto\rvisible\r\n+al revés \u202e)(\r\n",
      evidence: [{ path: "src/app.ts", from: 1, to: 1, text: "uno\u0007\tdos\u009b" }],
    };
    expect(scopeRequestNote(tricky, ES)).toBe(
      [
        "src/app.test.ts",
        "— Motivo\\u001b[2K",
        "",
        "El cambio al test:",
        "diff --git a/src/app.test.ts b/src/app.test.ts",
        "+oculto\\u000dvisible",
        "+al revés \\u202e)(",
        "",
        "El código que lo sustenta:",
        "src/app.ts:1-1",
        "1 │ uno\\u0007\tdos\\u009b",
      ].join("\n"),
    );
  });
});
