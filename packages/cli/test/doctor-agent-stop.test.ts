// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { cli, read, tempRepo, writeFiles } from "./support";

const PACKAGE = { "package.json": '{"name":"x","scripts":{"test":"true"}}\n' };

/** Each agent whose end of turn lives in a JSON hooks file: its tool, its name and that file. */
const AGENTS: readonly (readonly [string, string, string])[] = [
  ["claude-code", "Claude Code", ".claude/settings.local.json"],
  ["codex", "Codex", ".codex/hooks.json"],
  ["cursor", "Cursor", ".cursor/hooks.json"],
  ["gemini-cli", "Gemini CLI", ".gemini/settings.json"],
  ["windsurf", "Devin (Windsurf)", ".devin/hooks.v1.json"],
  ["antigravity", "Antigravity", ".agents/hooks.json"],
];
const TOOLS = AGENTS.map(([tool]) => tool).join(",");

/** What `doctor` says of an agent whose end of turn is missing. */
const missing = (name: string) =>
  `${name}: falta el fin de turno de Specty (\`hook agent-stop\`), que devuelve al agente a \`specty wait\` cuando el cambio espera a la persona; ejecuta \`specty init\`.`;

/** A repository where `init` installed every agent whose end of turn lives in a JSON file. */
async function installed(): Promise<string> {
  const root = await tempRepo(PACKAGE);
  expect((await cli(root, ["init", "--language", "es", "--tools", TOOLS])).code).toBe(0);
  return root;
}

/** `value` without the entries, at any depth, that run Specty's end of turn: an older install. */
function withoutStop(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((entry: unknown) => !JSON.stringify(entry).includes(" hook agent-stop "))
      .map(withoutStop);
  }
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutStop(item)]));
}

/** Rewrites each agent's hooks file with `update` applied to its text. */
async function rewrite(root: string, update: (text: string) => string): Promise<void> {
  for (const [, , file] of AGENTS) {
    await writeFiles(root, { [file]: update(await read(root, file)) });
  }
}

describe("doctor and each agent's end of turn in its JSON hooks file", () => {
  it("AC1: says it is missing for each agent whose guard is there without it, with specty init, and exits with 1", async () => {
    const root = await installed();
    await rewrite(root, (text) => JSON.stringify(withoutStop(JSON.parse(text)), null, 2));
    for (const [tool, , file] of AGENTS) {
      expect(await read(root, file), tool).not.toContain("hook agent-stop");
      expect(await read(root, file), tool).toContain(`guard --tool ${tool}`);
    }
    const doctor = await cli(root, ["doctor"]);
    for (const [, name] of AGENTS) expect(doctor.out).toContain(missing(name));
    // The memory's net stays where it was: only the end of turn is missing.
    expect(doctor.out).not.toContain("red de la memoria");
    expect(doctor.code).toBe(1);
  });

  it("AC3: says nothing of it while the end of turn is there, with --no-check as init writes it or without the mark as check --install leaves it", async () => {
    const root = await installed();
    const fresh = await cli(root, ["doctor"]);
    for (const [, name] of AGENTS) expect(fresh.out).not.toContain(missing(name));
    await rewrite(root, (text) => text.replaceAll(" --no-check", ""));
    for (const [tool, , file] of AGENTS) {
      expect(await read(root, file), tool).toMatch(new RegExp(`hook agent-stop ${tool}"`));
    }
    const checked = await cli(root, ["doctor"]);
    for (const [, name] of AGENTS) expect(checked.out).not.toContain(missing(name));
  });
});
