// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  assumptionDecidedLine,
  type CardContext,
  changesRequestedLine,
  commentSavedLine,
  emptyCommentCard,
  noAssumptionCard,
  nothingToRequestCard,
  reloadNext,
  renderText,
  reviewingNote,
  reviewRefusalCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const HEADER = "SPECTY · 20261020-saludo · review";

describe("a refused independent review", () => {
  it("is optional: the agent goes on with `next`", () => {
    const phase = reviewRefusalCard({ reason: "not-reviewable" }, "SPECTY", ES);
    expect(phase.status).toBe("blocked");
    expect(renderText(phase, "es")).toBe(
      [
        "SPECTY",
        "La revisión independiente se pide con la spec en revisión, después de `specty propose`, o con el resultado en aceptación.",
        "SIGUIENTE: sigue con `specty next`.",
      ].join("\n"),
    );
    expect(reviewRefusalCard({ reason: "not-configured" }, HEADER, EN).blocks[0]?.lines).toEqual([
      "This project has no independent review: the person sets it up with `review.command` in .specty/config.yaml.",
    ]);
    expect(
      reviewRefusalCard({ reason: "too-large", range: "a1b2..c3d4" }, HEADER, ES).blocks[0]?.lines,
    ).toEqual(["El diff del cambio es demasiado grande para revisarlo entero (a1b2..c3d4)."]);
    expect(reviewRefusalCard({ reason: "no-diff" }, HEADER, EN).next).toBe(
      "go on with `specty next`.",
    );
  });

  it("says when the reviewer failed, and that the review is optional", () => {
    const failed = reviewRefusalCard(
      { reason: "failed", command: "claude -p", code: 1 },
      HEADER,
      ES,
    );
    expect(renderText(failed, "es")).toBe(
      [
        HEADER,
        "La revisión falló (`claude -p`, código 1).",
        "SIGUIENTE: díselo al usuario y sigue con `specty next`: la revisión es opcional.",
      ].join("\n"),
    );
    expect(
      reviewRefusalCard({ reason: "failed", command: "x", code: undefined }, HEADER, EN).blocks[0]
        ?.lines,
    ).toEqual(["The review failed (`x`, code none)."]);
    expect(reviewingNote("claude -p", "es")).toBe("specty: revisando con `claude -p`…");
  });
});

describe("the review of a spec in the UI", () => {
  it("decides an assumption at a time", () => {
    expect(renderText(noAssumptionCard("A9", HEADER, ES), "es")).toBe(
      `${HEADER}\nLa spec no tiene el supuesto A9.\nSIGUIENTE: vuelve a cargar la revisión.`,
    );
    expect(assumptionDecidedLine("A1", "confirmed", "es")).toBe("A1 confirmado.");
    expect(assumptionDecidedLine("A2", "rejected", "en")).toBe(
      "A2 rejected: the agent must fix the spec.",
    );
  });

  it("keeps comments, and asks the agent for the changes", () => {
    expect(renderText(emptyCommentCard(HEADER, EN), "en")).toBe(
      `${HEADER}\nThe comment is empty.\nNEXT: write what should change.`,
    );
    expect(commentSavedLine("c2", "es")).toBe(
      "Comentario c2 guardado; cuando termines, pide los cambios.",
    );
    expect(nothingToRequestCard(HEADER, ES).next).toBe(
      "comenta lo que debe cambiar, o aprueba la spec.",
    );
    expect(changesRequestedLine(["c1", "A2"], "en")).toBe("Changes asked of the agent: c1, A2.");
    expect(reloadNext("ui", ES)).toBe("vuelve a cargar la UI.");
    expect(reloadNext("review", EN)).toBe("reload the review.");
  });
});
