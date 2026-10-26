// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  checkStatus,
  decisionPostponedCard,
  noSuchChangeCard,
  nothingChangedCard,
  nothingWaitsCard,
  otherFolderNote,
  renderText,
  whichChangeQuestion,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

describe("where a person's decision applies", () => {
  it("refuses a change no folder has, or a decision no change waits for", () => {
    expect(renderText(noSuchChangeCard("20261020-otro", ES), "es")).toBe(
      "SPECTY\nNo hay ningún cambio 20261020-otro.\nSIGUIENTE: revisa `specty status`.",
    );
    const none = nothingWaitsCard("accept", EN);
    expect(none.status).toBe("blocked");
    expect(renderText(none, "en")).toBe(
      "SPECTY\nNo change waits for `accept`.\nNEXT: check `specty status`.",
    );
  });

  it("asks which change when several wait, and names the folder of the chosen one", () => {
    expect(whichChangeQuestion("es")).toBe("¿En qué cambio?");
    expect(whichChangeQuestion("en")).toBe("Which change?");
    const change = { id: "20261020-saludo", title: "Saludo", folder: "../repo.worktrees/x" };
    expect(otherFolderNote(change, "es")).toEqual({
      title: "Cambio",
      text: "20261020-saludo — Saludo, en ../repo.worktrees/x",
    });
    expect(otherFolderNote(change, "en").text).toBe(
      "20261020-saludo — Saludo, in ../repo.worktrees/x",
    );
  });

  it("changes nothing when the person puts the decision off", () => {
    expect(checkStatus(EN)).toBe("check `specty status`.");
    const nothing = nothingChangedCard("SPECTY", checkStatus(ES), ES);
    expect(nothing.status).toBe("ok");
    expect(renderText(nothing, "es")).toBe(
      "SPECTY\nNada cambió.\nSIGUIENTE: revisa `specty status`.",
    );
    expect(renderText(decisionPostponedCard("20261020-saludo", "acceptance", EN), "en")).toBe(
      [
        "SPECTY · 20261020-saludo · acceptance",
        "Nothing changed.",
        "NEXT: check `specty status` when you want to decide.",
      ].join("\n"),
    );
  });
});
