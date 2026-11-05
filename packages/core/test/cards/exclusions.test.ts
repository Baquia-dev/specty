// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type CardContext, doctorLine, initCard, nextCard, renderText } from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** Two tools that see what Specty writes, as `doctor` finds them. */
const VITEST = {
  name: "Vitest",
  path: ".worktrees/",
  add: '"**/.worktrees/**"',
  file: "vitest.config.ts (test.exclude)",
};
const BIOME = {
  name: "Biome",
  path: ".specty/",
  add: '"!.specty"',
  file: "biome.json (files.includes)",
};

const INIT = { done: ["Hecho."], detected: [], warnings: [], unfilled: [] };

/** The lines of `text` under the section `title`, up to the next section or SIGUIENTE. */
const sectionOf = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return (end === -1 ? rest : rest.slice(0, end)).map((line) => line.slice(2));
};

describe("the tools that see what Specty writes, where the agent reads them", () => {
  it("AC1: next with no active change lists doctor's line of each and how to fix them, keeping its SIGUIENTE", () => {
    const plain = renderText(nextCard({ dirty: [] }, ES), "es");
    const text = renderText(nextCard({ dirty: [], exclusions: [VITEST, BIOME] }, ES), "es");
    expect(sectionOf(text, "HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY")).toEqual([
      doctorLine({ code: "formatter-checks", ...VITEST }, ES),
      doctorLine({ code: "formatter-checks", ...BIOME }, ES),
      'Díselo al usuario. Si quiere que lo corrijas, es un cambio como cualquier otro: `specty new "Las herramientas no ven lo que escribe Specty" --request "<petición literal del usuario>"`.',
    ]);
    expect(text.split("\n").at(-1)).toBe(plain.split("\n").at(-1));

    const english = renderText(nextCard({ dirty: [], exclusions: [VITEST] }, EN), "en");
    expect(sectionOf(english, "TOOLS THAT SEE WHAT SPECTY WRITES")).toEqual([
      'Vitest also checks .worktrees/, which Specty writes: add "**/.worktrees/**" to vitest.config.ts (test.exclude).',
      'Tell the user. If they want you to fix it, it is a change like any other: `specty new "Tools do not see what Specty writes" --request "<the user\'s literal request>"`.',
    ]);
  });

  it("AC1: the block goes before the reminders of Specty's memory, without its pending items", () => {
    const open = {
      status: "open" as const,
      created: "2026-11-01T10:00:00.000Z",
      origin: { by: "claude-code" },
    };
    const memory = [
      { ...open, id: "P1", kind: "reminder" as const, text: "Algo que recordar" },
      { ...open, id: "P2", kind: "pending" as const, text: "Algo pendiente" },
    ];
    const text = renderText(nextCard({ dirty: [], exclusions: [VITEST], memory }, ES), "es");
    expect(text.indexOf("HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY:")).toBeGreaterThan(-1);
    expect(text.indexOf("HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY:")).toBeLessThan(
      text.indexOf("RECORDATORIOS:"),
    );
    expect(text).not.toContain("MEMORIA DE SPECTY:");
    expect(text).not.toContain("Algo pendiente");
  });

  it("AC2: next adds no block when every tool excludes it", () => {
    const text = renderText(nextCard({ dirty: [], exclusions: [] }, ES), "es");
    expect(text).not.toContain("HERRAMIENTAS QUE VEN");
    expect(text).toBe(renderText(nextCard({ dirty: [] }, ES), "es"));
  });

  it("AC3: init's card lists them after its warnings, with how they are fixed", () => {
    const text = renderText(initCard({ ...INIT, exclusions: [VITEST] }, ES), "es");
    expect(sectionOf(text, "HERRAMIENTAS QUE VEN LO QUE ESCRIBE SPECTY")).toEqual([
      doctorLine({ code: "formatter-checks", ...VITEST }, ES),
      'Se corrige en un cambio, como cualquier otro: el agente edita cada configuración y la persona aprueba el diff (`specty new "Las herramientas no ven lo que escribe Specty"`).',
    ]);
    const english = renderText(initCard({ ...INIT, exclusions: [VITEST] }, EN), "en");
    expect(sectionOf(english, "TOOLS THAT SEE WHAT SPECTY WRITES")).toContain(
      'It is fixed in a change like any other: the agent edits each configuration and the person approves the diff (`specty new "Tools do not see what Specty writes"`).',
    );
    expect(renderText(initCard(INIT, ES), "es")).not.toContain("HERRAMIENTAS QUE VEN");
  });
});
