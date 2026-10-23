// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  nextCard,
  type ProposedView,
  proposedCard,
  recommendEffort,
  type SizeResult,
  scopeRequestedCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };
const delegated = (ctx: CardContext): CardContext => ({ ...ctx, delegated: true });

const size: SizeResult = {
  level: "S",
  baseLevel: "S",
  score: 1,
  adjust: 0,
  reasons: [],
  signals: {
    files: { create: 0, modify: 1, delete: 0, rename: 0 },
    fileCount: 1,
    modules: [],
    sensitive: [],
    manifests: [],
    tasks: 1,
    highFanIn: [],
    modulesWithoutTests: [],
  },
};
const proposed = (closing: boolean): ProposedView => ({
  header: "SPECTY · 20261021-x · review",
  specPath: ".specty/changes/20261021-x/spec.md",
  size,
  effort: recommendEffort("S"),
  warnings: [],
  delta: [],
  closing,
});
const view = (phase: ChangeView["phase"], extra: Partial<ChangeView> = {}): ChangeView => ({
  id: "20261021-x",
  kind: "standard",
  phase,
  title: "X",
  specPath: ".specty/changes/20261021-x/spec.md",
  branch: "specty/20261021-x",
  revision: 1,
  tasks: [],
  conventions: [],
  pendingScope: [],
  rejected: [],
  closingSubmitted: false,
  specChanged: false,
  ...extra,
});
const next = (change: ChangeView, ctx: CardContext) => nextCard({ change, dirty: [] }, ctx).next;

/** Every `SIGUIENTE:` that waits for a decision of the person, with the command it names. */
const decisions = (ctx: CardContext) => [
  { next: proposedCard(proposed(false), ctx).next, command: "`specty approve`" },
  { next: proposedCard(proposed(true), ctx).next, command: "`specty close`" },
  {
    next: scopeRequestedCard("H", "S1", ["src/b.ts"], ctx).next,
    command: "`specty approve --scope S1`",
  },
  { next: next(view("review"), ctx), command: "`specty approve`" },
  { next: next(view("acceptance"), ctx), command: "`specty accept`" },
  { next: next(view("closing", { closingSubmitted: true }), ctx), command: "`specty close`" },
];

describe("agent cards in delegated mode", () => {
  it("tell the agent to run the person's command itself", () => {
    for (const entry of decisions(delegated(ES))) {
      expect(entry.next).toMatch(/^modo delegado: \S+ tú /);
      expect(entry.next).toContain(entry.command);
      expect(entry.next).not.toContain("termina tu turno");
    }
    for (const entry of decisions(delegated(EN))) {
      expect(entry.next).toMatch(/^delegated mode: .* yourself /);
      expect(entry.next).toContain(entry.command);
    }
  });

  it("keep asking the user without delegation", () => {
    const plain = decisions(ES);
    expect(decisions({ ...ES, delegated: false })).toEqual(plain);
    for (const entry of plain) {
      expect(entry.next).toContain("usuario");
      expect(entry.next).toContain(entry.command);
      expect(entry.next).not.toContain("modo delegado");
    }
    expect(plain[0]?.next).toBe(
      "dile al usuario que la spec está lista en .specty/changes/20261021-x/spec.md, con su tamaño y el esfuerzo recomendado, y que la apruebe con `specty approve` en su terminal; luego termina tu turno.",
    );
    expect(plain[3]?.next).toBe(
      "pide al usuario que revise la spec y la apruebe con `specty approve` en su terminal; luego termina tu turno.",
    );
  });

  it("say who reviews and who confirms the closing", () => {
    const review = nextCard({ change: view("review"), dirty: [] }, delegated(ES));
    expect(review.blocks.flatMap((block) => block.lines)).toEqual([
      "Modo delegado: la revisión te toca a ti. No modifiques código.",
    ]);
    const closing = nextCard(
      { change: view("closing", { closingSubmitted: true }), dirty: [] },
      delegated(EN),
    );
    expect(closing.blocks.flatMap((block) => block.lines)).toEqual([
      "Closing submitted; in delegated mode you confirm it.",
    ]);
  });

  it("still sends rejected assumptions back to the agent's spec", () => {
    const rejected = view("review", {
      rejected: [{ id: "A1", text: "Supuesto", comment: "No" }],
    });
    expect(next(rejected, delegated(ES))).toBe(next(rejected, ES));
  });
});
