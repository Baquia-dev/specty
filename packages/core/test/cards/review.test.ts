// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  computeSize,
  DEFAULT_CONFIG,
  decideGuard,
  diffReviewPrompt,
  nextCard,
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
      target: "spec" as const,
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

describe("the independent review of the result", () => {
  const DIFF = "diff --git a/src/a.ts b/src/a.ts\n+export const a = eval(x);\n";
  const change = (recommendReview: boolean): ChangeView => ({
    id: "20261024-x",
    kind: "standard",
    phase: "acceptance",
    title: "X",
    specPath: ".specty/changes/20261024-x/spec.md",
    revision: 1,
    tasks: [],
    conventions: [],
    pendingScope: [],
    rejected: [],
    closingSubmitted: false,
    specChanged: false,
    ...(recommendReview ? { recommendReview } : {}),
  });

  it("gets instructions for code, the spec and the diff", () => {
    const prompt = diffReviewPrompt(SPEC, DIFF, "es");
    expect(prompt).toContain("Eres un revisor independiente de un cambio de código");
    expect(prompt).toContain(
      `<spec>\n${SPEC.trimEnd()}\n</spec>\n\n<diff>\n${DIFF.trimEnd()}\n</diff>`,
    );
    expect(diffReviewPrompt(SPEC, DIFF, "en")).toContain("criteria the diff does not meet");
  });

  it("is what the acceptance card asks for first, when it is recommended", () => {
    const next = (recommended: boolean) =>
      nextCard({ change: change(recommended), dirty: [] }, ES).next;
    expect(next(true)).toBe(
      "antes de pedir la aceptación, ejecuta `specty review`: una revisión independiente del resultado con un modelo más fuerte.",
    );
    expect(next(false)).toContain("`specty accept`");
  });

  it("asks to tell the user, and to accept or adjust", () => {
    const view = {
      header: "SPECTY · 20261024-x · acceptance",
      target: "diff" as const,
      command: "claude -p",
      path: ".specty/changes/20261024-x/reviews/diff-1.md",
      text: "- Alta: eval sobre la entrada.",
    };
    expect(reviewedCard(view, ES).next).toBe(
      'cuéntale al usuario lo que encontró la revisión y pídele que acepte con `specty accept`, o, si pide arreglar algo, ejecuta `specty adjust "<petición literal>"`. La revisión es información: decide la persona.',
    );
    expect(reviewedCard(view, { ...ES, delegated: true }).next).toBe(
      'si la revisión encontró un defecto real, pide el ajuste con `specty adjust "<qué arreglar>"`; si no, acepta tú con `specty accept`. La revisión es información.',
    );
  });
});
