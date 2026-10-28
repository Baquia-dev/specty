// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { busyChangeCard, type CardContext, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const HOLDER = {
  command: "accept",
  pid: 4321,
  at: "2026-10-28T04:38:48.160Z",
  folder: "../specty.worktrees/20261028-saludo",
};

describe("a change another command is changing", () => {
  it("AC1: names the command, its process, since when and its folder, and asks to wait", () => {
    const card = busyChangeCard("20261028-saludo", HOLDER, ES);
    expect(card.status).toBe("blocked");
    expect(renderText(card, "es")).toBe(
      [
        "SPECTY · 20261028-saludo",
        "Otro comando está cambiando 20261028-saludo: `specty accept` (pid 4321, desde 2026-10-28 04:38:48 UTC, en ../specty.worktrees/20261028-saludo). Dos a la vez pisarían su estado.",
        "SIGUIENTE: espera a que termine y vuelve a ejecutar tu comando; si ese proceso ya no existe, su bloqueo deja de contar solo.",
      ].join("\n"),
    );
    expect(renderText(busyChangeCard("20261028-saludo", { ...HOLDER, folder: "" }, EN), "en")).toBe(
      [
        "SPECTY · 20261028-saludo",
        "Another command is changing 20261028-saludo: `specty accept` (pid 4321, since 2026-10-28 04:38:48 UTC, in this folder). Two at once would overwrite its state.",
        "NEXT: wait for it to finish and run your command again; if that process no longer exists, its lock stops counting by itself.",
      ].join("\n"),
    );
  });
});
