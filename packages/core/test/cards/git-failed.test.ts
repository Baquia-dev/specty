// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, gitFailedCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const DETAIL = "git commit: error: gpg failed to sign the data";

describe("the card of a git failure", () => {
  it("AC1: says which git command failed and why, and asks to fix it and run the command again", () => {
    const card = gitFailedCard(DETAIL, ES);
    expect(card.status).toBe("invalid");
    expect(renderText(card, "es")).toContain(
      "Git falló y Specty no terminó el comando: git commit: error: gpg failed to sign the data.",
    );
    expect(renderText(card, "es")).toContain(
      "SIGUIENTE: corrige lo que hizo fallar a git (un hook, la firma, un archivo bloqueado…) y vuelve a ejecutar el comando.",
    );
  });

  it("AC2: speaks English in an English session", () => {
    const text = renderText(gitFailedCard(DETAIL, EN), "en");
    expect(text).toContain(
      "Git failed and Specty did not finish the command: git commit: error: gpg failed to sign the data.",
    );
    expect(text).toContain(
      "NEXT: fix what made git fail (a hook, signing, a locked file…) and run the command again.",
    );
  });
});
