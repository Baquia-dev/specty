// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { unreachableEnterDenial } from "../../src";

/** A change whose folder is outside every folder Antigravity lets its agent work in. */
const OUTSIDE = {
  id: "20261101-esqueleto",
  folder: "/p/app.worktrees/20261101-esqueleto",
  workspace: ["/p/app", "/home/.gemini/antigravity-acp"],
  home: "/p/app.worktrees",
  tool: "antigravity",
} as const;

describe("entering a change's folder out of the tool's reach", () => {
  it("AC1: names the tool's folders and the change's, and how to carry on, in Spanish", () => {
    const { reason, next } = unreachableEnterDenial(OUTSIDE, "es", "specty");
    expect(reason).toBe(
      "Antigravity solo trabaja dentro de las carpetas de su espacio de trabajo (`/p/app`, `/home/.gemini/antigravity-acp`), y la del cambio 20261101-esqueleto, `/p/app.worktrees/20261101-esqueleto`, no está en ninguna: allí no podría leer ni escribir nada.",
    );
    expect(next).toBe(
      "no entres. Dile al usuario que abra `/p/app.worktrees/20261101-esqueleto` en su editor (en Zed, con el selector de worktrees: `git: worktree`) y siga allí en una conversación nueva que empiece por `specty next`, o que añada `/p/app.worktrees` al proyecto de su editor para que Antigravity pueda entrar en cualquier cambio; luego termina tu turno.",
    );
  });

  it("AC1: names the tool's folders and the change's, and how to carry on, in English", () => {
    const { reason, next } = unreachableEnterDenial(OUTSIDE, "en", "specty");
    expect(reason).toBe(
      "Antigravity only works inside the folders of its workspace (`/p/app`, `/home/.gemini/antigravity-acp`), and the folder of change 20261101-esqueleto, `/p/app.worktrees/20261101-esqueleto`, is in none of them: it could not read or write anything there.",
    );
    expect(next).toBe(
      "do not enter. Tell the user to open `/p/app.worktrees/20261101-esqueleto` in their editor (in Zed, with the worktree picker: `git: worktree`) and carry on there in a new conversation that starts with `specty next`, or to add `/p/app.worktrees` to their editor's project so that Antigravity can enter any change; then end your turn.",
    );
  });
});
