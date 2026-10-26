// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  renderText,
  retroDoneCard,
  retroReasonQuestion,
  retroRefusalCard,
  retroTitle,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("the cards of a refused `retro`", () => {
  it("send the agent to the retro already in progress", () => {
    const card = retroRefusalCard(
      { reason: "in-progress", id: "20261020-retro", phase: "draft" },
      ES,
    );
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · 20261020-retro · draft",
        "Ya hay una retro en curso: 20261020-retro.",
        "SIGUIENTE: ejecuta `specty next`.",
      ].join("\n"),
    );
  });

  it("ask to stage the changes first", () => {
    const card = retroRefusalCard({ reason: "nothing-staged" }, EN);
    expect(renderText(card, "en")).toBe(
      "SPECTY\nThere is no staged governed code.\nNEXT: stage the changes with `git add` and run `specty retro` again.",
    );
  });

  it("send the person to their agent without minimal mode, and back without a reason", () => {
    expect(retroRefusalCard({ reason: "minimal-unavailable" }, ES).next).toBe(
      "pídele a tu agente: «Documenta los cambios preparados con specty retro».",
    );
    expect(retroRefusalCard({ reason: "minimal-unavailable" }, EN).blocks[0]?.lines).toEqual([
      "Minimal mode is not enabled (retro.mode: minimal) or there is no person at the terminal.",
    ]);
    const card = retroRefusalCard({ reason: "no-reason" }, ES);
    expect(renderText(card, "es")).toBe(
      "SPECTY\nSin motivo no hay retro.\nSIGUIENTE: vuelve a ejecutar `specty retro --minimal`.",
    );
  });
});

describe("a retro", () => {
  it("is titled by its modules, and asks the person why", () => {
    expect(retroTitle("api, web", "es")).toBe("Cambios manuales en api, web");
    expect(retroTitle("api", "en")).toBe("Manual changes in api");
    expect(retroReasonQuestion("es")).toBe("¿Por qué hiciste estos cambios?");
    expect(retroReasonQuestion("en")).toBe("Why did you make these changes?");
  });

  it("once documented, asks for the commit again", () => {
    const card = retroDoneCard("20261020-retro", EN);
    expect(card.status).toBe("ok");
    expect(renderText(card, "en")).toBe(
      [
        "SPECTY · 20261020-retro · done",
        "Changes documented and staged with your commit.",
        "NEXT: run `git commit` again.",
      ].join("\n"),
    );
    expect(retroDoneCard("20261020-retro", ES).next).toBe("vuelve a ejecutar `git commit`.");
  });
});
