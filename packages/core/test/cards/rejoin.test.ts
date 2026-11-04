// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type NextView, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };
const CURSOR: CardContext = { ...ES, tool: "cursor" };

const ID = "20261104-saludo";
const FOLDER = `/repo/.worktrees/${ID}`;
const OWN = { id: ID, title: "Saludo", folder: FOLDER };
const ORPHAN = {
  id: "20261103-panel",
  title: "Panel",
  phase: "implementing",
  folder: ".worktrees/20261103-panel",
} as const;

/** `next`'s card with no active change, as text. */
const card = (view: Partial<NextView>, ctx: CardContext = CLAUDE): string =>
  renderText(nextCard({ dirty: [], ...view }, ctx), ctx.lang);

describe("the card of a conversation outside its change's folder", () => {
  it("AC1: names its change and folder, and asks it to go back there instead of creating one", () => {
    const text = card({ own: OWN, byName: true });
    expect(text).toContain("TU CAMBIO:");
    expect(text).toContain(
      `Esta conversación trabaja en el cambio ${ID} («Saludo»), en ${FOLDER}, y ahora está fuera de esa carpeta.`,
    );
    expect(text).toContain(
      `SIGUIENTE: vuelve a ${FOLDER}: cambia allí la carpeta de trabajo de tu sesión (en Claude Code, \`EnterWorktree\` con \`name: "${ID}"\`; o abre allí un agente) y ejecuta \`specty next\``,
    );
    expect(text).not.toContain("No hay un cambio activo.");
    expect(text).not.toContain("specty new");
  });

  it("AC1: says another session can take other work", () => {
    expect(card({ own: OWN, byName: true })).toContain(
      "No crees otro cambio para seguir con este: una sesión trabaja un solo cambio a la vez, y otro trabajo va en otra sesión.",
    );
  });

  it("AC1: without the worktree hooks, Claude Code switches its folder or opens an agent there", () => {
    expect(card({ own: OWN, byName: false })).toContain(
      `SIGUIENTE: vuelve a ${FOLDER}: cambia allí la carpeta de trabajo de tu sesión (o abre allí un agente) y ejecuta \`specty next\``,
    );
  });

  it("AC1: an agent that enters with `specty enter` hears that command", () => {
    expect(card({ own: OWN, byName: false }, CURSOR)).toContain(`\`specty enter ${ID}\``);
  });

  it("AC1: goes before the changes without a spec and the orphans", () => {
    const text = card({ own: OWN, byName: true, dirty: ["src/app.ts"], orphans: [ORPHAN] });
    expect(text).toContain("TU CAMBIO:");
    expect(text).not.toContain("CAMBIOS SIN SPEC");
    expect(text).not.toContain("CAMBIOS SIN CONVERSACIÓN");
  });

  it("AC1: in English", () => {
    const text = card({ own: OWN, byName: true }, { ...EN, tool: "claude-code" });
    expect(text).toContain("YOUR CHANGE:");
    expect(text).toContain(
      `This conversation works on change ${ID} («Saludo»), in ${FOLDER}, and is now outside that folder.`,
    );
    expect(text).toContain(
      "Do not create another change to carry on with this one: a session works on one change at a time, and other work goes in another session.",
    );
    expect(text).toContain(
      `NEXT: go back to ${FOLDER}: switch your session's working folder there`,
    );
  });
});

describe("the changes no conversation holds", () => {
  it("AC3: lists each one with its folder and how to resume it, and still proposes `specty new`", () => {
    const text = card({ orphans: [ORPHAN], byName: true });
    expect(text).toContain("CAMBIOS SIN CONVERSACIÓN:");
    expect(text).toContain(
      "  20261103-panel · implementing — Panel · en .worktrees/20261103-panel",
    );
    expect(text).toContain(
      'Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: en Claude Code, `EnterWorktree` con `name: "<id>"`.',
    );
    expect(text).toMatch(/SIGUIENTE: ejecuta `specty new "<título>"/);
  });

  it("AC3: go after the card's text", () => {
    const text = card({ orphans: [ORPHAN], byName: true });
    expect(text.indexOf("CAMBIOS SIN CONVERSACIÓN:")).toBeGreaterThan(
      text.indexOf("No hay un cambio activo."),
    );
  });

  it("AC3: an agent that enters with `specty enter` resumes it with that command", () => {
    expect(card({ orphans: [ORPHAN], byName: false }, CURSOR)).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: `specty enter <id>`.",
    );
  });

  it("AC3: without the worktree hooks, the session switches its folder or opens an agent there", () => {
    expect(card({ orphans: [ORPHAN], byName: false })).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: cambia allí la carpeta de trabajo de tu sesión o abre allí un agente.",
    );
  });

  it("AC3: no block without orphans", () => {
    expect(card({ orphans: [], byName: true })).not.toContain("CAMBIOS SIN CONVERSACIÓN");
  });

  it("AC3: in English", () => {
    const text = card({ orphans: [ORPHAN], byName: true }, { ...EN, tool: "claude-code" });
    expect(text).toContain("CHANGES NO CONVERSATION HOLDS:");
    expect(text).toContain(
      "  20261103-panel · implementing — Panel · in .worktrees/20261103-panel",
    );
    expect(text).toContain(
      'If the user asks to carry on with one of them, resume it in its folder instead of creating another change: in Claude Code, `EnterWorktree` with `name: "<id>"`.',
    );
  });
});
