// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, renderText, type StatusEntry, statusCard } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const entry = (extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id: "a",
  kind: "standard",
  phase: "implementing",
  title: "A",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

/** The status line of `extra`'s change, in `ctx`'s language. */
const line = (extra: Partial<StatusEntry>, ctx: CardContext = ES): string | undefined =>
  renderText(statusCard([entry(extra)], ctx), ctx.lang)
    .split("\n")
    .find((text) => text.includes("— A"))
    ?.trimStart();

describe("a change whose conversation is outside its folder, in the status line", () => {
  it("AC1: says so, with the agent, how long ago and how to go back", () => {
    const away = { tool: "claude-code", ago: 5 };
    expect(line({ folder: ".worktrees/a", away })).toBe(
      "a · standard · implementing · espera al agente — A · en .worktrees/a · fuera de su carpeta: claude-code dio su último paso en otra carpeta hace 5 min; en esa conversación, `specty next` dice cómo volver",
    );
    expect(line({ folder: ".worktrees/a", away }, EN)).toBe(
      "a · standard · implementing · waits for the agent — A · in .worktrees/a · outside its folder: claude-code last stepped in another folder 5 min ago; in that conversation, `specty next` tells how to go back",
    );
  });

  it("AC1: says it instead of who held it or that it is an orphan", () => {
    const text = line({
      away: { tool: "claude-code", ago: 0 },
      holder: { tool: "claude-code", ago: 90 },
      orphan: true,
    });
    expect(text).toContain(
      "fuera de su carpeta: claude-code dio su último paso en otra carpeta ahora mismo",
    );
    expect(text).not.toContain("huérfano");
    expect(text).not.toContain("lo lleva");
  });

  it("AC1: is in the card's data for `status --json`", () => {
    const away = { tool: "codex", ago: 12 };
    expect(statusCard([entry({ away })], ES).changes[0]).toMatchObject({ away });
  });
});
