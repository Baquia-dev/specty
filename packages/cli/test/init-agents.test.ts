// SPDX-License-Identifier: Apache-2.0
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Terminal } from "../src/session";
import { cli, person, read, tempRepo } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
const INIT = ["init", "--language", "es", "--tools", "claude-code"];
/** What Codex leaves in the environment of the commands it runs. */
const CODEX = { CODEX_THREAD_ID: "019a-hilo" };
const NO_AGENT = "No se detectó ningún agente";

/** The `SIGUIENTE:` line of an output. */
const nextOf = (out: string) => out.split("\n").find((line) => line.startsWith("SIGUIENTE:"));

const has = (root: string, path: string) =>
  access(join(root, path)).then(
    () => true,
    () => false,
  );

/** Claude Code's guard, in its shared or its local settings. */
const claudeGuard = async (root: string) =>
  (await has(root, ".claude/settings.json")) || (await has(root, ".claude/settings.local.json"));

/** A person who gives `answers` and whose questions, with the values offered, are recorded. */
function recorded(answers: readonly string[]) {
  const asked: { readonly message: string; readonly values: readonly string[] }[] = [];
  const base = person({ choose: answers });
  const terminal: Terminal = {
    ...base,
    choose: (message, options) => {
      asked.push({ message, values: options.map((option) => option.value) });
      return base.choose(message, options);
    },
  };
  return { terminal, asked };
}

/** A person at the terminal who must not be asked anything. */
const UNASKED: Terminal = {
  ...person(),
  choose: () => Promise.reject(new Error("no debe preguntar")),
};

describe("the agents init installs", () => {
  it("adds the one running it to those its files show (AC3)", async () => {
    // Codex keeps its skills in `.agents/`, which several agents read: it marks none.
    const files = {
      ...CODE,
      "AGENTS.md": "# App\n",
      ".agents/skills/deploy/SKILL.md": "# Deploy\n",
    };
    const alone = await tempRepo(files);
    const done = await cli(alone, ["init", "--language", "es"], { env: CODEX });
    expect(done.code).toBe(0);
    expect(await read(alone, ".codex/hooks.json")).toContain("guard --tool codex");
    expect(await claudeGuard(alone)).toBe(false);
    expect(done.out).not.toContain(NO_AGENT);
    // With Claude Code's files too, both go in.
    const both = await tempRepo({ ...files, "CLAUDE.md": "# Reglas\n" });
    expect((await cli(both, ["init", "--language", "es"], { env: CODEX })).code).toBe(0);
    expect(await read(both, ".codex/hooks.json")).toContain("guard --tool codex");
    expect(await claudeGuard(both)).toBe(true);
  });

  it("asks a person when it finds none, after the language, Claude Code first (AC4)", async () => {
    const root = await tempRepo(CODE);
    const { terminal, asked } = recorded(["es", "cursor"]);
    const done = await cli(root, ["init"], { terminal });
    expect(done.code).toBe(0);
    expect(asked.map((question) => question.message)).toEqual([
      "¿En qué idioma trabaja Specty? · Which language should Specty work in?",
      "No se detectó ningún agente. ¿Con cuál trabajas en este repositorio?",
    ]);
    expect(asked[1]?.values[0]).toBe("claude-code");
    expect(await has(root, ".cursor/hooks.json")).toBe(true);
    expect(await claudeGuard(root)).toBe(false);
    expect(done.out).not.toContain(NO_AGENT);
  });

  it("installs Claude Code's and says so when nobody can answer (AC5)", async () => {
    const agent = await tempRepo(CODE);
    const done = await cli(agent, ["init", "--language", "es"]);
    expect(done.code).toBe(0);
    expect(await claudeGuard(agent)).toBe(true);
    expect(done.out).toContain(`${NO_AGENT}: se instaló el guard de Claude Code.`);
    // A dry run asks nothing either: it plans Claude Code's and warns.
    const planned = await cli(await tempRepo(CODE), ["init", "--language", "es", "--dry-run"], {
      terminal: UNASKED,
    });
    expect(planned.code).toBe(0);
    expect(planned.out).toMatch(/crear \.claude\/settings(\.local)?\.json/);
    expect(planned.out).toContain(NO_AGENT);
  });

  it("installs only the tools given, without asking or adding the running agent (AC6)", async () => {
    const root = await tempRepo(CODE);
    const done = await cli(root, ["init", "--language", "es", "--tools", "cursor"], {
      terminal: UNASKED,
      env: CODEX,
    });
    expect(done.code).toBe(0);
    expect(await has(root, ".cursor/hooks.json")).toBe(true);
    expect(await has(root, ".codex/hooks.json")).toBe(false);
    expect(await claudeGuard(root)).toBe(false);
    expect(done.out).not.toContain(NO_AGENT);
  });
});

describe("what init asks for after installing", () => {
  it("names the sections of a new AGENTS.md, still empty (AC1)", async () => {
    const root = await tempRepo(CODE);
    const done = await cli(root, INIT);
    expect(done.code).toBe(0);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: completa las secciones «Mapa» y «Convenciones» de AGENTS\.md con lo que no se deduce del código, revisa \.specty\/config\.yaml y ejecuta `.+ doctor`\.$/,
    );
  });

  it("names only the empty one of an AGENTS.md that had them (AC1)", async () => {
    const agents = "# App\n\n## Mapa\n\n- `src/`: la app.\n\n## Convenciones\n\n<!-- Pista. -->\n";
    const root = await tempRepo({ ...CODE, "AGENTS.md": agents });
    const done = await cli(root, INIT);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: completa la sección «Convenciones» de AGENTS\.md/,
    );
  });

  it("names none when an AGENTS.md that already existed does not have them (AC2)", async () => {
    const root = await tempRepo({ ...CODE, "AGENTS.md": "# App\n\nInstrucciones propias.\n" });
    const done = await cli(root, INIT);
    expect(done.code).toBe(0);
    expect(nextOf(done.out)).toMatch(
      /^SIGUIENTE: revisa \.specty\/config\.yaml y ejecuta `.+ doctor`\.$/,
    );
  });
});
