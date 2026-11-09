// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type AgentTool, type CardContext, type NextView, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };

const ORPHANS = [
  {
    id: "20261103-panel",
    title: "Panel",
    phase: "implementing",
    folder: ".worktrees/20261103-panel",
  },
  { id: "20261104-notas", title: "Notas", phase: "draft", folder: ".worktrees/20261104-notas" },
] as const;

/** `next`'s card with no active change, as text. */
const card = (view: Partial<NextView>, ctx: CardContext): string =>
  renderText(nextCard({ dirty: [], ...view }, ctx), ctx.lang);

/** The card with the orphans, with Specty's worktree hooks. */
const withOrphans = (ctx: CardContext) => card({ orphans: ORPHANS, byName: true }, ctx);

/** How Claude Code waits for the person, as the other briefs already say it. */
const WAIT =
  "ejecuta `specty wait` para esperar su decisión. Ejecútalo en segundo plano (`run_in_background: true`), que te avisa al terminar, y vuelve a ejecutarlo cada vez que se agote o se corte.";

/** The block's last line with subagents: what to do when the user asks to carry on with one. */
const launch = (how = "") =>
  `  Si el usuario pide seguir uno de ellos, no crees otro cambio ni entres en su carpeta: lanza un subagente con el encargo para retomarlo tal cual${how}, con su id en lugar de \`<id>\`.`;

const BLOCK = [
  "CAMBIOS SIN CONVERSACIÓN:",
  "  20261103-panel · implementing — Panel · en .worktrees/20261103-panel",
  "  20261104-notas · draft — Notas · en .worktrees/20261104-notas",
  launch(),
].join("\n");

const BRIEF = [
  "ENCARGO PARA RETOMAR:",
  "  Retoma el cambio <id> hasta su cierre, sin lanzar otros subagentes:",
  "  1. `specty enter <id>`",
  "  2. Tu `cd` no dura entre comandos: empieza cada uno con `cd '<carpeta del cambio>' &&` y usa rutas absolutas de esa carpeta.",
  `  3. Sigue \`specty next\` hasta cerrarlo; cuando espere a la persona, ${WAIT}`,
  "  4. Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
  "  5. Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.",
  "  6. Responde en tres líneas: el cambio, su fase y lo que falta.",
].join("\n");

describe("the changes no conversation holds, when the tool hands changes to subagents", () => {
  it("AC1: lists each one and asks for a subagent with the brief to resume it, not EnterWorktree", () => {
    const text = withOrphans(CLAUDE);
    expect(text).toContain(BLOCK);
    expect(text).not.toContain("EnterWorktree");
    expect(text).not.toContain("retómalo en su carpeta");
  });

  it("AC1: with every tool that hands work to subagents", () => {
    const tools: readonly AgentTool[] = ["claude-code", "codex", "opencode", "cursor"];
    for (const tool of tools) {
      const text = withOrphans({ ...ES, tool });
      expect(text, tool).toContain(launch());
      expect(text, tool).toContain("ENCARGO PARA RETOMAR:");
    }
  });

  it("AC2: the brief follows the block, enters with `specty enter <id>` and closes the change", () => {
    const text = withOrphans(CLAUDE);
    expect(text).toContain(BRIEF);
    expect(text.indexOf("ENCARGO PARA RETOMAR:")).toBeGreaterThan(
      text.indexOf("CAMBIOS SIN CONVERSACIÓN:"),
    );
    // The card's own brief, for a change the user asks for, and its next step stay as they were.
    expect(text).toContain("ENCARGO:\n  Haz el cambio que pidió el usuario");
    expect(text.split("\n").at(-1)).toMatch(
      /^SIGUIENTE: lanza un subagente por cada cambio que pidió el usuario/,
    );
  });

  it("AC3: is today's block, without the brief, with subagents: false or a tool without them", () => {
    const today =
      '  Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: en Claude Code, `EnterWorktree` con `name: "<id>"`.';
    expect(withOrphans({ ...CLAUDE, subagents: false })).toContain(today);
    expect(withOrphans(ES)).toContain(today);
    expect(withOrphans({ ...ES, tool: "windsurf" })).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: `specty enter <id>`.",
    );
    expect(withOrphans({ ...ES, tool: "cursor", subagents: false })).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: `specty enter <id>`.",
    );
    expect(card({ orphans: ORPHANS, byName: false }, { ...CLAUDE, subagents: false })).toContain(
      "retómalo en su carpeta en lugar de crear otro cambio: cambia allí la carpeta de trabajo de tu sesión o abre allí un agente.",
    );
    for (const ctx of [ES, { ...CLAUDE, subagents: false }, { ...ES, tool: "windsurf" as const }]) {
      const text = withOrphans(ctx);
      expect(text).not.toContain("ENCARGO PARA RETOMAR");
      expect(text).not.toContain("lanza un subagente con el encargo para retomarlo");
    }
  });

  it("AC4: asks Antigravity to launch the brief in the conversation's own workspace", () => {
    expect(withOrphans({ ...ES, tool: "antigravity" })).toContain(
      launch(
        ' (en Antigravity, `invoke_subagent` con `Workspace: "inherit"`, no `branch`, que le daría una carpeta que no es la de su cambio)',
      ),
    );
  });

  it("AC5: in English", () => {
    const text = withOrphans({ ...EN, tool: "claude-code" });
    expect(text).toContain(
      [
        "CHANGES NO CONVERSATION HOLDS:",
        "  20261103-panel · implementing — Panel · in .worktrees/20261103-panel",
        "  20261104-notas · draft — Notas · in .worktrees/20261104-notas",
        "  If the user asks to carry on with one of them, do not create another change nor enter its folder: launch a subagent with the brief to resume it as is, with its id in place of `<id>`.",
      ].join("\n"),
    );
    expect(text).toContain(
      [
        "BRIEF TO RESUME:",
        "  Resume change <id> until it is closed, without launching other subagents:",
        "  1. `specty enter <id>`",
        "  2. Your `cd` does not last between commands: start each one with `cd '<change folder>' &&` and use absolute paths in that folder.",
        "  3. Follow `specty next` until it is closed; when it waits for the person, run `specty wait`",
      ].join("\n"),
    );
    expect(text).toContain(
      [
        "  4. If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
        "  5. If `propose` says the change is too large and asks to split it into an epic, do not turn it into one yourself: stop and answer with that, since the main session makes the epic in your change.",
        "  6. Answer in three lines: the change, its phase and what is left.",
      ].join("\n"),
    );
    expect(text).not.toContain("EnterWorktree");
  });

  it("AC5: no block nor brief without orphans", () => {
    for (const ctx of [CLAUDE, { ...EN, tool: "claude-code" as const }]) {
      const text = card({ orphans: [], byName: true }, ctx);
      expect(text).not.toContain("CAMBIOS SIN CONVERSACIÓN");
      expect(text).not.toContain("CHANGES NO CONVERSATION HOLDS");
      expect(text).not.toContain("ENCARGO PARA RETOMAR");
      expect(text).not.toContain("BRIEF TO RESUME");
    }
  });
});
