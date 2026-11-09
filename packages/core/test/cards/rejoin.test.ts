// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  type NextView,
  nextCard,
  renderText,
  type SliceView,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };
const CURSOR: CardContext = { ...ES, tool: "cursor" };
/** Claude Code without subagents: the orphans are resumed in their folders. */
const NO_SUBAGENTS: CardContext = { ...CLAUDE, subagents: false };

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
    expect(card({ orphans: [ORPHAN], byName: true }, NO_SUBAGENTS)).toContain(
      'Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: en Claude Code, `EnterWorktree` con `name: "<id>"`.',
    );
    // Claude Code hands each change to a subagent, whose brief starts with `specty new`.
    expect(text).toContain('1. `specty new "<título>" --request "<petición literal del usuario>"');
    expect(text).toMatch(/SIGUIENTE: lanza un subagente por cada cambio que pidió el usuario/);
    expect(card({ orphans: [ORPHAN], byName: true }, ES)).toMatch(
      /SIGUIENTE: ejecuta `specty new "<título>"/,
    );
  });

  it("AC3: go after the card's text", () => {
    const text = card({ orphans: [ORPHAN], byName: true });
    expect(text.indexOf("CAMBIOS SIN CONVERSACIÓN:")).toBeGreaterThan(
      text.indexOf("No hay un cambio activo."),
    );
  });

  it("AC3: an agent that enters with `specty enter` resumes it with that command", () => {
    expect(card({ orphans: [ORPHAN], byName: false }, { ...CURSOR, subagents: false })).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: `specty enter <id>`.",
    );
  });

  it("AC3: without the worktree hooks, the session switches its folder or opens an agent there", () => {
    expect(card({ orphans: [ORPHAN], byName: false }, NO_SUBAGENTS)).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: cambia allí la carpeta de trabajo de tu sesión o abre allí un agente.",
    );
  });

  it("AC3: no block without orphans", () => {
    expect(card({ orphans: [], byName: true })).not.toContain("CAMBIOS SIN CONVERSACIÓN");
  });

  it("AC3: in English", () => {
    const text = card(
      { orphans: [ORPHAN], byName: true },
      { ...EN, tool: "claude-code", subagents: false },
    );
    expect(text).toContain("CHANGES NO CONVERSATION HOLDS:");
    expect(text).toContain(
      "  20261103-panel · implementing — Panel · in .worktrees/20261103-panel",
    );
    expect(text).toContain(
      'If the user asks to carry on with one of them, resume it in its folder instead of creating another change: in Claude Code, `EnterWorktree` with `name: "<id>"`.',
    );
  });
});

const EPIC = "20261105-panel";
const EPIC_FOLDER = `/repo/.worktrees/${EPIC}`;

const slice = (
  id: string,
  status: SliceView["status"],
  extra: Partial<SliceView> = {},
): SliceView => ({ id, title: `Corte ${id}`, depends: [], status, ...extra });

const DONE = slice("C1", "done", { child: { id: "20261105-inicio", phase: "done" } });
const OPEN = slice("C2", "open", {
  child: { id: "20261105-notas", phase: "implementing", folder: "/repo/.worktrees/20261105-notas" },
});

/** The conversation's epic, approved in its own worktree, with `slices`. */
const ownEpic = (slices: readonly SliceView[]) => ({
  id: EPIC,
  title: "Panel",
  folder: EPIC_FOLDER,
  epic: {
    id: EPIC,
    kind: "epic",
    phase: "implementing",
    title: "Panel",
    specPath: `.specty/changes/${EPIC}/spec.md`,
    revision: 1,
    tasks: [],
    conventions: [],
    pendingScope: [],
    rejected: [],
    closingSubmitted: false,
    specChanged: false,
    slices,
    inWorktree: true,
  } satisfies ChangeView,
});

const AWAY = `Esta conversación lleva la épica ${EPIC} («Panel»), en ${EPIC_FOLDER}, y reparte sus cortes desde fuera de esa carpeta: no vuelvas a entrar en ella para lanzar los encargos.`;

describe("the card of a conversation outside its epic's folder", () => {
  it("AC3: is the epic's card, with its slices and briefs, and launches them from where it is", () => {
    const text = card({ own: ownEpic([DONE, slice("C2", "ready")]), byName: true });
    expect(text).toContain(`TU ÉPICA:\n  ${AWAY}`);
    expect(text).toContain("CORTES (1 de 2 cerrados):");
    expect(text).toContain("ENCARGO C2:");
    expect(text).not.toContain("TU CAMBIO");
    expect(text).not.toContain("EnterWorktree");
    expect(text).not.toContain("ExitWorktree");
    expect(text).toContain(
      "SIGUIENTE: lanza en paralelo, en un solo mensaje, un subagente por encargo con su texto tal cual; cuando terminen, vuelve a ejecutar `specty next` aquí.",
    );
  });

  it("AC3: with only slices in progress, waits for their subagents where it is", () => {
    const text = card({ own: ownEpic([DONE, OPEN]), byName: true });
    expect(text).toContain("TU ÉPICA:");
    expect(text).not.toContain("ENCARGO");
    expect(text).toContain(
      "SIGUIENTE: los cortes en curso siguen con sus subagentes: espera sus informes y, cuando terminen, vuelve a ejecutar `specty next` aquí.",
    );
  });

  it("AC3: in English", () => {
    const text = card(
      { own: ownEpic([slice("C1", "ready")]), byName: true },
      { ...EN, tool: "claude-code" },
    );
    expect(text).toContain(
      `YOUR EPIC:\n  This conversation carries epic ${EPIC} («Panel»), in ${EPIC_FOLDER}, and hands out its slices from outside that folder: do not go back into it to launch the briefs.`,
    );
    expect(text).toContain(
      "NEXT: launch in parallel, in a single message, one subagent per brief with its text as is; once they finish, run `specty next` again here.",
    );
  });

  it("AC4: asks to go back to the epic once no slice is left for the subagents", () => {
    const back = `SIGUIENTE: vuelve a ${EPIC_FOLDER}:`;
    for (const slices of [[DONE], [slice("C2", "waiting", { depends: ["C3"] })]]) {
      const text = card({ own: ownEpic(slices), byName: true });
      expect(text).toContain("TU CAMBIO:");
      expect(text).toContain(back);
      expect(text).not.toContain("TU ÉPICA");
    }
  });

  it("AC4: asks to go back to the epic when it does not hand out its slices", () => {
    const own = ownEpic([slice("C1", "ready")]);
    // Devin (Windsurf) can never hand out slices: its hooks do not document its subagents' actions.
    for (const ctx of [ES, { ...ES, tool: "windsurf" as const }, { ...CLAUDE, subagents: false }]) {
      const text = card({ own, byName: true }, ctx);
      expect(text).toContain("TU CAMBIO:");
      expect(text).toContain(`vuelve a ${EPIC_FOLDER}:`);
      expect(text).not.toContain("ENCARGO");
    }
  });
});
