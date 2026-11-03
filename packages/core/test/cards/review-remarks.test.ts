// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  type ReviewRemark,
  renderText,
  reviewRemarks,
  reviewRemarkText,
  uncitedRemarks,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** A reviewer's answer: severities in Spanish and English, in bold and in a heading. */
const ANSWER = [
  "Revisión del cambio:",
  "",
  "- **Alta** · src/auth.ts: el token no se valida.",
  "  - detalle con sangría, que no es otra observación",
  "- Baja: un caso de prioridad media sin test.",
  "* Media — src/app.ts: el caso vacío no se trata.",
  "1. Multimedia sin texto alternativo.",
  "",
  "## High",
  "",
  "- src/api.ts: the session never expires.",
  "- Low: a typo in a message.",
  "- CRITICAL: secrets in the log.",
  "",
  "## Otros",
  "",
  "- src/ui.ts: un nombre poco claro.",
].join("\n");

const closingCard = (change: Partial<ChangeView>, ctx: CardContext): string =>
  renderText(
    nextCard(
      {
        change: {
          id: "20261103-x",
          kind: "standard",
          phase: "closing",
          title: "X",
          specPath: ".specty/changes/20261103-x/spec.md",
          revision: 1,
          tasks: [],
          conventions: [],
          pendingScope: [],
          rejected: [],
          closingSubmitted: false,
          specChanged: false,
          ...change,
        },
        dirty: [],
      },
      ctx,
    ),
    ctx.lang,
  );

const HIGH: ReviewRemark = {
  ref: "diff-2.md#1",
  severity: "high",
  text: "Alta: el token no se valida.",
};
const MEDIUM: ReviewRemark = {
  ref: "diff-2.md#3",
  severity: "medium",
  text: "Media: el caso vacío no se trata.",
};
const REMARKS: readonly ReviewRemark[] = [HIGH, MEDIUM];

describe("the remarks of an independent review", () => {
  it("AC1: are its first-level bullets of high or medium severity, numbered among all of them", () => {
    const remarks = reviewRemarks("diff-2.md", ANSWER);
    expect(remarks.slice(0, 2)).toEqual([
      {
        ref: "diff-2.md#1",
        severity: "high",
        text: "**Alta** · src/auth.ts: el token no se valida.",
      },
      {
        ref: "diff-2.md#3",
        severity: "medium",
        text: "Media — src/app.ts: el caso vacío no se trata.",
      },
    ]);
  });

  it("AC1: become a pending item that says where it comes from, in each language", () => {
    const dir = ".specty/archive/2026/20261103-x/reviews";
    expect(reviewRemarkText(MEDIUM, dir, "es")).toBe(
      "Observación de la revisión independiente que el cierre no citó (`.specty/archive/2026/20261103-x/reviews/diff-2.md#3`): Media: el caso vacío no se trata.",
    );
    expect(reviewRemarkText(MEDIUM, dir, "en")).toBe(
      "Remark of the independent review that the closing did not cite (`.specty/archive/2026/20261103-x/reviews/diff-2.md#3`): Media: el caso vacío no se trata.",
    );
  });

  it("AC2: leave out the low ones, those without a severity and those the closing cites", () => {
    const remarks = reviewRemarks("diff-2.md", ANSWER);
    const refs = remarks.map((remark) => remark.ref);
    // #2 is low though it says «media» later, #4 says «Multimedia», #6 is low, #8 has no severity.
    expect(refs).toEqual(["diff-2.md#1", "diff-2.md#3", "diff-2.md#5", "diff-2.md#7"]);
    const closing =
      "### Decisiones\n\n- diff-2.md#1 se corrigió en el ajuste; diff-2.md#30 no existe.\n";
    expect(uncitedRemarks(remarks, closing).map((remark) => remark.ref)).toEqual([
      "diff-2.md#3",
      "diff-2.md#5",
      "diff-2.md#7",
    ]);
    expect(uncitedRemarks(remarks, undefined)).toEqual(remarks);
    expect(reviewRemarks("diff-1.md", "No encuentro nada importante.\n")).toEqual([]);
  });

  it("AC3: show in the closing card with their reference and how to cite them", () => {
    expect(closingCard({ reviewRemarks: REMARKS }, ES)).toContain(
      [
        "OBSERVACIONES DE LA REVISIÓN:",
        "  diff-2.md#1 · Alta: el token no se valida.",
        "  diff-2.md#3 · Media: el caso vacío no se trata.",
        "  Cita en el cierre, con el motivo, la referencia de las que corregiste o que no son un problema real; las que no cites pasan a la memoria como pendientes al cerrar.",
      ].join("\n"),
    );
    expect(closingCard({ reviewRemarks: REMARKS }, EN)).toContain(
      [
        "REVIEW REMARKS:",
        "  diff-2.md#1 · Alta: el token no se valida.",
        "  diff-2.md#3 · Media: el caso vacío no se trata.",
        "  Cite in the closing, with the reason, the reference of those you fixed or that are not a real problem; those you do not cite become pending items in the memory on close.",
      ].join("\n"),
    );
    expect(closingCard({}, ES)).not.toContain("OBSERVACIONES DE LA REVISIÓN");
    expect(closingCard({ reviewRemarks: [] }, ES)).not.toContain("OBSERVACIONES DE LA REVISIÓN");
    expect(closingCard({ reviewRemarks: REMARKS, closingSubmitted: true }, ES)).not.toContain(
      "OBSERVACIONES DE LA REVISIÓN",
    );
  });

  it("AC4: are recognized with the severity in English, in bold or in a heading above them", () => {
    const remarks = reviewRemarks("diff-2.md", ANSWER);
    expect(remarks.slice(2)).toEqual([
      { ref: "diff-2.md#5", severity: "high", text: "src/api.ts: the session never expires." },
      { ref: "diff-2.md#7", severity: "high", text: "CRITICAL: secrets in the log." },
    ]);
    expect(reviewRemarks("diff-3.md", "- **Medium** (src/a.ts): a missing case.\n")).toEqual([
      { ref: "diff-3.md#1", severity: "medium", text: "**Medium** (src/a.ts): a missing case." },
    ]);
  });
});
