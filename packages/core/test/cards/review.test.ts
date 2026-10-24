// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  computeSize,
  DEFAULT_CONFIG,
  decideGuard,
  type ProposedView,
  proposedCard,
  recommendEffort,
  resolveConfig,
  reviewedCard,
  specReviewPrompt,
} from "../../src";
import { fixture, specOf } from "../helpers";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const SPEC = fixture("standard.es.md");

const proposed = (review: boolean): ProposedView => ({
  header: "SPECTY · 20261024-x · review",
  specPath: ".specty/changes/20261024-x/spec.md",
  size: computeSize(specOf(SPEC), DEFAULT_CONFIG),
  effort: recommendEffort("L"),
  warnings: [],
  delta: [],
  closing: false,
  ...(review ? { review } : {}),
});

describe("the independent review", () => {
  it("is configured by the person, with the verification's time limit by default", () => {
    const result = resolveConfig({ version: 1, review: { command: "claude -p" } });
    expect(result.ok && result.config.review).toEqual({ command: "claude -p", timeoutSec: 600 });
    const own = resolveConfig({ version: 1, review: { command: "x", timeoutSec: 60 } });
    expect(own.ok && own.config.review?.timeoutSec).toBe(60);
    expect(resolveConfig({ version: 1 }).ok && DEFAULT_CONFIG.review).toBeUndefined();
  });

  it("gets instructions and the spec, in the spec's language", () => {
    const prompt = specReviewPrompt(SPEC, "es");
    expect(prompt).toContain("Eres un revisor independiente");
    expect(prompt).toContain(`<spec>\n${SPEC.trimEnd()}\n</spec>`);
    expect(specReviewPrompt(SPEC, "en")).toContain("You are an independent reviewer");
  });

  it("is what propose asks for first, when it is recommended", () => {
    expect(proposedCard(proposed(true), ES).next).toBe(
      "antes de pedir la aprobación, ejecuta `specty review`: una revisión independiente de la spec con un modelo más fuerte.",
    );
    expect(proposedCard(proposed(false), ES).next).toContain("`specty approve`");
  });

  it("shows its answer and asks to fix what is real before the approval", () => {
    const view = {
      header: "SPECTY · 20261024-x · review",
      command: "claude -p --model opus",
      path: ".specty/changes/20261024-x/reviews/spec-r1.md",
      text: "- Alta: AC2 no se puede comprobar.\n- Baja: falta un test.",
    };
    const card = reviewedCard(view, ES);
    expect(card.blocks).toContainEqual({
      title: "REVISIÓN INDEPENDIENTE (claude -p --model opus)",
      lines: [
        "Guardada en .specty/changes/20261024-x/reviews/spec-r1.md.",
        "- Alta: AC2 no se puede comprobar.",
        "- Baja: falta un test.",
      ],
    });
    expect(card.next).toBe(
      "corrige en la spec lo que sea un problema real y vuelve a ejecutar `specty propose`; si no hay nada que corregir, cuéntale al usuario lo que encontró la revisión y pídele que apruebe con `specty approve`. La revisión es información: decide la persona.",
    );
    expect(reviewedCard(view, { ...ES, delegated: true }).next).toContain(
      "si no hay nada que corregir, aprueba tú con `specty approve`",
    );
  });

  it("is protected from the agent", () => {
    const write = {
      kind: "write" as const,
      paths: [".specty/changes/20261024-x/reviews/spec-r1.md"],
    };
    const ctx = { config: DEFAULT_CONFIG, lang: "es" as const, command: "specty" };
    expect(decideGuard(write, ctx)).toMatchObject({ allow: false, rule: "protected" });
  });
});
