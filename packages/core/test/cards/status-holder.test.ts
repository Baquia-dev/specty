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

describe("who holds each change, in the status line", () => {
  it("AC1: names the agent that holds it and how long ago it stepped", () => {
    expect(line({ holder: { tool: "claude-code", ago: 3 } })).toBe(
      "a · standard · implementing · espera al agente — A · lo lleva claude-code, hace 3 min",
    );
    expect(line({ holder: { tool: "claude-code", ago: 3 } }, EN)).toBe(
      "a · standard · implementing · waits for the agent — A · held by claude-code, 3 min ago",
    );
  });

  it("AC1: goes after the folder, and says just now under a minute", () => {
    expect(line({ folder: "../repo.worktrees/a", holder: { tool: "codex", ago: 0 } })).toBe(
      "a · standard · implementing · espera al agente — A · en ../repo.worktrees/a · lo lleva codex, ahora mismo",
    );
    expect(line({ holder: { tool: "codex", ago: 0 } }, EN)).toContain(
      "— A · held by codex, just now",
    );
  });

  it("AC1: counts minutes, then hours up to two days, then days", () => {
    const ago = (minutes: number) => line({ holder: { tool: "cursor", ago: minutes } });
    expect(ago(59)).toContain("lo lleva cursor, hace 59 min");
    expect(ago(60)).toContain("lo lleva cursor, hace 1 h");
    expect(ago(125)).toContain("lo lleva cursor, hace 2 h");
    expect(ago(47 * 60)).toContain("lo lleva cursor, hace 47 h");
    expect(ago(48 * 60)).toContain("lo lleva cursor, hace 2 d");
    expect(ago(80 * 60)).toContain("lo lleva cursor, hace 3 d");
  });

  it("AC2: marks an orphan with the last agent that stepped in it", () => {
    expect(line({ orphan: true, holder: { tool: "claude-code", ago: 120 } })).toBe(
      "a · standard · implementing · espera al agente — A · huérfano: claude-code dio su último paso hace 2 h",
    );
    expect(line({ orphan: true, holder: { tool: "claude-code", ago: 120 } }, EN)).toContain(
      "— A · orphaned: claude-code last stepped 2 h ago",
    );
  });

  it("AC2: marks an orphan no session ever held", () => {
    expect(line({ orphan: true })).toBe(
      "a · standard · implementing · espera al agente — A · huérfano: ninguna sesión lo lleva",
    );
    expect(line({ orphan: true }, EN)).toContain("— A · orphaned: no session holds it");
  });

  it("AC1: says nothing more when nobody stepped and it is not an orphan", () => {
    expect(line({})).toBe("a · standard · implementing · espera al agente — A");
  });

  it("AC1: carries the holder and the orphan mark as data", () => {
    const card = statusCard([entry({ orphan: true, holder: { tool: "codex", ago: 90 } })], ES);
    expect(card.changes[0]).toMatchObject({ orphan: true, holder: { tool: "codex", ago: 90 } });
  });
});
