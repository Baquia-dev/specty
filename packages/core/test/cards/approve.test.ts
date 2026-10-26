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
