// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  type ChangeView,
  DEFAULT_CONFIG,
  NOTE_MAX,
  nextCard,
  renderText,
  type TaskView,
} from "../../src";

/** About 1,500 tokens (ARCHITECTURE §7), estimated as characters ÷ 4: Specty depends on no model. */
const BUDGET = 1_500;
const tokens = (text: string) => Math.ceil(text.length / 4);

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** Plain prose `length` characters long, as a summary, a finding or a criterion may be. */
const prose = (length: number) =>
  "La tarea deja el servidor listo para la persona. ".repeat(30).slice(0, length);
const path = (n: number) => `packages/cli/src/server/acciones-de-la-persona-${n}.ts`;

/**
 * The largest reasonable task card: as many tasks as a change has before `propose` asks to split
 * it (`split.maxTasks`), the active one with as many files as a task has before `propose` warns
 * (`split.taskMaxFiles`), 3 long criteria and a scope request; every summary at `summary`
 * characters, and 4 findings at the most. Raising those limits makes this card larger.
 */
function largest(summary: number): ChangeView {
  const { maxTasks, taskMaxFiles } = DEFAULT_CONFIG.split;
  const done = Array.from(
    { length: maxTasks - 1 },
    (_, index): TaskView => ({
      id: `T${index + 1}`,
      title: prose(80),
      status: "done",
      files: [path(index)],
      extras: [],
      criteria: [],
      effort: "medium",
      summary: prose(summary),
      commit: "a1b2c3d",
      ...(index < 4 ? { findings: [prose(NOTE_MAX)] } : {}),
    }),
  );
  const active: TaskView = {
    id: `T${maxTasks}`,
    title: prose(80),
    status: "active",
    files: Array.from({ length: taskMaxFiles }, (_, index) => path(index + 1)),
    extras: [],
    criteria: [1, 2, 3].map((n) => ({ id: `AC${n}`, text: prose(300) })),
    verify: "pnpm --filter @baquia-dev/specty exec vitest run test/server/acciones.test.ts",
    effort: "high",
    testRules: "first",
  };
  const id = "20261024-un-cambio-con-un-titulo-largo-de-verdad";
  return {
    id,
    kind: "standard",
    phase: "implementing",
    title: prose(80),
    specPath: `.specty/changes/${id}/spec.md`,
    revision: 3,
    tasks: [...done, active],
    conventions: ["packages/AGENTS.md", "packages/cli/AGENTS.md", "packages/cli/src/AGENTS.md"],
    pendingScope: [
      {
        id: "S1",
        task: `T${maxTasks}`,
        paths: [path(maxTasks + taskMaxFiles)],
        reason: prose(120),
      },
    ],
    rejected: [],
    closingSubmitted: false,
    specChanged: false,
    // As many terms as a card brings, each past the longest line it shows.
    glossary: {
      path: "docs/dominio.md",
      entries: ["Tarea", "Servidor", "Persona"].map((term) => ({
        term,
        code: `${term}Repository`,
        definition: prose(200),
      })),
    },
  };
}

const card = (change: ChangeView, ctx: CardContext) =>
  renderText(nextCard({ change, dirty: [] }, ctx), ctx.lang);

describe("the task card's budget", () => {
  it("keeps the largest reasonable card within about 1,500 tokens, in both languages (AC2)", () => {
    for (const ctx of [ES, EN]) {
      const text = card(largest(NOTE_MAX), ctx);
      // Every block is there: the card measured is the full one.
      for (const block of ctx.lang === "es"
        ? [
            "ARCHIVOS PERMITIDOS:",
            "CRITERIOS:",
            "TÉRMINOS DEL DOMINIO:",
            "CONVENCIONES:",
            "HECHO:",
            "HALLAZGOS:",
            "TESTS:",
          ]
        : [
            "ALLOWED FILES:",
            "CRITERIA:",
            "DOMAIN TERMS:",
            "CONVENTIONS:",
            "DONE:",
            "FINDINGS:",
            "TESTS:",
          ]) {
        expect(text).toContain(block);
      }
      expect(tokens(text)).toBeLessThanOrEqual(BUDGET);
    }
  });

  it("would not keep to it with summaries as long as some agents wrote them (AC2)", () => {
    // Before the limit, archived changes had summaries of almost 1,000 characters.
    expect(tokens(card(largest(980), ES))).toBeGreaterThan(BUDGET);
  });
});
