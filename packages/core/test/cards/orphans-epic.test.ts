// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, type NextView, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const CLAUDE: CardContext = { ...ES, tool: "claude-code" };

const EPIC = {
  id: "20261105-tablero",
  kind: "epic",
  title: "Tablero",
  phase: "implementing",
  folder: ".worktrees/20261105-tablero",
} as const;
const CHANGE = {
  id: "20261104-notas",
  kind: "standard",
  title: "Notas",
  phase: "draft",
  folder: ".worktrees/20261104-notas",
} as const;

/** `next`'s card with no active change and these orphans, as text, with the worktree hooks. */
const card = (orphans: NonNullable<NextView["orphans"]>, ctx: CardContext, byName = true): string =>
  renderText(nextCard({ dirty: [], orphans, byName }, ctx), ctx.lang);

const EPIC_LINE =
  "  20261105-tablero · implementing · épica — Tablero · en .worktrees/20261105-tablero";
const CHANGE_LINE = "  20261104-notas · draft — Notas · en .worktrees/20261104-notas";

/** The block's line for an epic, with how the session goes into its folder. */
const resumeEpic = (how: string) =>
  `  Una épica no va a un subagente, que no podría lanzar los subagentes de sus cortes: si el usuario pide seguirla, retómala tú en su carpeta en lugar de crear otro cambio, cuando terminen los subagentes que estén trabajando: ${how}.`;
const BY_NAME = 'en Claude Code, `EnterWorktree` con `name: "<id>"`';

const LAUNCH =
  "  Si el usuario pide seguir uno de ellos, no crees otro cambio ni entres en su carpeta: lanza un subagente con el encargo para retomarlo tal cual, con su id en lugar de `<id>`.";

/** The step of the brief of a new change, which the brief to resume takes too. */
const STEP =
  "Si `propose` dice que el cambio es demasiado grande y pide dividirlo en una épica, no lo conviertas tú: detente y responde con eso, que la épica la hace la sesión principal en tu cambio.";
const STEP_EN =
  "If `propose` says the change is too large and asks to split it into an epic, do not turn it into one yourself: stop and answer with that, since the main session makes the epic in your change.";

describe("an orphan that is an epic, when the tool hands changes to subagents", () => {
  it("AC1: is marked, and the session resumes it itself instead of a subagent", () => {
    const text = card([EPIC], CLAUDE);
    expect(text).toContain(
      ["CAMBIOS SIN CONVERSACIÓN:", EPIC_LINE, resumeEpic(BY_NAME)].join("\n"),
    );
    expect(text).not.toContain("ENCARGO PARA RETOMAR");
    expect(text).not.toContain("lanza un subagente con el encargo para retomarlo");
  });

  it("AC1: an agent that enters with `specty enter` resumes it with that command", () => {
    expect(card([EPIC], { ...ES, tool: "cursor" }, false)).toContain(
      resumeEpic("`specty enter <id>`"),
    );
  });

  it("AC2: with other orphans, the subagent and its brief stay for them, and the epic's line follows", () => {
    const text = card([EPIC, CHANGE], CLAUDE);
    expect(text).toContain(
      [
        "CAMBIOS SIN CONVERSACIÓN:",
        EPIC_LINE,
        CHANGE_LINE,
        LAUNCH,
        resumeEpic(BY_NAME),
        "ENCARGO PARA RETOMAR:",
      ].join("\n"),
    );
  });
});

describe("the brief to resume an orphan", () => {
  it("AC3: stops before turning its change into an epic, as the brief of a new change does", () => {
    const text = card([CHANGE], CLAUDE);
    expect(text).toContain(
      [
        "  4. Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
        `  5. ${STEP}`,
        "  6. Responde en tres líneas: el cambio, su fase y lo que falta.",
      ].join("\n"),
    );
    // The brief of a new change keeps its steps as they were.
    expect(text).toContain(
      [
        "  5. Si para la spec te falta una respuesta del usuario, no la supongas: detente y responde con la pregunta.",
        `  6. ${STEP}`,
        "  7. Responde en tres líneas: el cambio, su fase y lo que falta.",
      ].join("\n"),
    );
  });
});

describe("an orphan that is an epic, without subagents", () => {
  it("AC4: is marked, and the block is today's", () => {
    const today =
      '  Si el usuario pide seguir uno de ellos, retómalo en su carpeta en lugar de crear otro cambio: en Claude Code, `EnterWorktree` con `name: "<id>"`.';
    for (const ctx of [ES, { ...CLAUDE, subagents: false }]) {
      const text = card([EPIC, CHANGE], ctx);
      expect(text).toContain(
        ["CAMBIOS SIN CONVERSACIÓN:", EPIC_LINE, CHANGE_LINE, today].join("\n"),
      );
      expect(text).not.toContain("Una épica no va a un subagente");
      expect(text).not.toContain("ENCARGO PARA RETOMAR");
    }
  });
});

describe("in English", () => {
  it("AC5: the mark, the epic's line and the brief's step", () => {
    const text = card([EPIC, CHANGE], { ...EN, tool: "claude-code" });
    expect(text).toContain(
      [
        "CHANGES NO CONVERSATION HOLDS:",
        "  20261105-tablero · implementing · epic — Tablero · in .worktrees/20261105-tablero",
        "  20261104-notas · draft — Notas · in .worktrees/20261104-notas",
        "  If the user asks to carry on with one of them, do not create another change nor enter its folder: launch a subagent with the brief to resume it as is, with its id in place of `<id>`.",
        '  An epic does not go to a subagent, which could not launch the subagents of its slices: if the user asks to carry on with it, resume it yourself in its folder instead of creating another change, once the subagents at work finish: in Claude Code, `EnterWorktree` with `name: "<id>"`.',
      ].join("\n"),
    );
    expect(text).toContain(
      [
        "  4. If the spec needs an answer from the user, do not assume it: stop and answer with the question.",
        `  5. ${STEP_EN}`,
        "  6. Answer in three lines: the change, its phase and what is left.",
      ].join("\n"),
    );
  });
});
