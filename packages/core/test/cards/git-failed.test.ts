// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, gitFailedCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const DETAIL = "git commit: error: gpg failed to sign the data";
const LOCKED = "git config: error: could not lock config file .git/config: File exists";
const UNDONE = {
  folder: "/repo/.worktrees/20261105-otro-cambio",
  branch: "specty/20261105-otro-cambio",
};

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

  it("AC4: says in Spanish what Specty undid, the folder and the branch, and to run it again", () => {
    const card = gitFailedCard(LOCKED, ES, UNDONE);
    expect(card.status).toBe("invalid");
    const text = renderText(card, "es");
    expect(text).toContain(
      "Git falló y Specty no terminó el comando: git config: error: could not lock config file .git/config: File exists.",
    );
    expect(text).toContain(
      "Specty deshizo lo que había creado: la carpeta /repo/.worktrees/20261105-otro-cambio y la rama specty/20261105-otro-cambio.",
    );
    expect(text).toContain("SIGUIENTE: corrige lo que hizo fallar a git");
    expect(renderText(gitFailedCard(DETAIL, ES), "es")).not.toContain("deshizo");
  });

  it("AC4: says it in English in an English session", () => {
    const text = renderText(gitFailedCard(LOCKED, EN, UNDONE), "en");
    expect(text).toContain(
      "Specty undid what it had created: the folder /repo/.worktrees/20261105-otro-cambio and the branch specty/20261105-otro-cambio.",
    );
    expect(text).toContain("NEXT: fix what made git fail");
  });
});
