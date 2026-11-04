// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  lostFolderCard,
  nextCard,
  renderText,
  worktreeHookRefusal,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const ID = "20261104-saludo";
const FOLDER = "/repo/.worktrees/20261104-saludo";
const LOST = [{ id: ID, title: "Saludo", phase: "implementing" as const }];

describe("`next` with no change and changes without their folder", () => {
  it("AC1: lists them, with how to bring their folder back, and still goes on with `specty new`", () => {
    const text = renderText(nextCard({ dirty: [], lost: LOST }, ES), "es");
    expect(text).toContain(`CAMBIOS SIN CARPETA:\n  ${ID} · implementing — Saludo`);
    expect(text).toContain(
      "Si el usuario pide seguir uno de ellos, recupera su carpeta con `specty restore <id>` en lugar de crear otro cambio.",
    );
    expect(text).toContain("SIGUIENTE: ejecuta `specty new");
  });

  it("AC1: is written in English too, and says nothing without them", () => {
    const text = renderText(nextCard({ dirty: [], lost: LOST }, EN), "en");
    expect(text).toContain(`CHANGES WITHOUT THEIR FOLDER:\n  ${ID} · implementing — Saludo`);
    expect(text).toContain(
      "If the user asks to carry on with one of them, bring its folder back with `specty restore <id>` instead of creating another change.",
    );
    expect(renderText(nextCard({ dirty: [], lost: [] }, ES), "es")).not.toContain(
      "CAMBIOS SIN CARPETA",
    );
  });
});

describe("Claude Code's `WorktreeCreate` for a change without its folder", () => {
  it("AC2: says the folder was lost and how to bring it back", () => {
    expect(worktreeHookRefusal({ reason: "lost", id: ID, command: "specty" }, "es")).toBe(
      `La carpeta del cambio ${ID} se perdió; el cambio sigue en su rama. Recupérala con \`specty restore ${ID}\` y vuelve a pedir \`EnterWorktree\` con \`name: "${ID}"\`.`,
    );
    expect(worktreeHookRefusal({ reason: "lost", id: ID, command: "specty" }, "en")).toBe(
      `The folder of change ${ID} was lost; the change is still on its branch. Bring it back with \`specty restore ${ID}\` and ask for \`EnterWorktree\` with \`name: "${ID}"\` again.`,
    );
  });
});

describe("`specty enter` for a change without its folder", () => {
  it("AC3: says the folder was lost, and asks to restore it and enter again", () => {
    const card = lostFolderCard(ID, ES);
    expect(card.status).toBe("blocked");
    const text = renderText(card, "es");
    expect(text).toContain(`La carpeta del cambio ${ID} se perdió; el cambio sigue en su rama.`);
    expect(text).toContain(
      `SIGUIENTE: recupérala con \`specty restore ${ID}\` y vuelve a ejecutar \`specty enter ${ID}\`.`,
    );
    expect(renderText(lostFolderCard(ID, EN), "en")).toContain(
      `NEXT: bring it back with \`specty restore ${ID}\` and run \`specty enter ${ID}\` again.`,
    );
  });
});

describe("a conversation bound to a change whose folder was lost", () => {
  it("AC4: hears that the folder was lost, and is asked to restore it instead of a new change", () => {
    const own = { id: ID, title: "Saludo", folder: FOLDER, lost: true };
    const text = renderText(nextCard({ dirty: [], own, lost: LOST }, ES), "es");
    expect(text).toContain("TU CAMBIO:");
    expect(text).toContain(
      `Esta conversación trabaja en el cambio ${ID} («Saludo»), cuya carpeta ${FOLDER} se perdió; el cambio sigue en su rama.`,
    );
    expect(text).toContain(
      `SIGUIENTE: recupera la carpeta con \`specty restore ${ID}\` y sigue su salida, que dice cómo volver a ella.`,
    );
    expect(text).not.toContain("specty new");
    expect(text).not.toContain("CAMBIOS SIN CARPETA");
    const english = renderText(nextCard({ dirty: [], own }, EN), "en");
    expect(english).toContain(
      `This conversation works on change ${ID} («Saludo»), whose folder ${FOLDER} was lost; the change is still on its branch.`,
    );
    expect(english).toContain(
      `NEXT: bring the folder back with \`specty restore ${ID}\` and follow its output, which tells how to go back to it.`,
    );
  });
});
