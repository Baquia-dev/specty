// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exists } from "../src/io/files";
import type { Terminal } from "../src/session";
import { cli, person, read, released, tempRepo } from "./support";

const CODE = { "src/app.ts": "export const a = 1;\n" };
/** Files that say the repository uses Cursor and Antigravity. */
const CURSOR = { ".cursorrules": "Reglas de Cursor.\n" };
const ANTIGRAVITY = { ".antigravityignore": "dist/\n" };
const NO_AGENT =
  "No se detectó ningún agente: se instaló el guard de Claude Code. Si usas otro, ejecuta `specty init --tools <herramienta>` con alguna de estas: claude-code, antigravity.";

const has = (root: string, path: string) => exists(join(root, path));

/** Claude Code's guard, in its shared or its local settings. */
const claudeGuard = async (root: string) =>
  (await has(root, ".claude/settings.json")) || (await has(root, ".claude/settings.local.json"));

/** A person who takes what init offers checked, and whose questions with several answers are kept. */
function recording() {
  const asked: { readonly values: readonly string[]; readonly initial: readonly string[] }[] = [];
  const base = person();
  const terminal: Terminal = {
    ...base,
    chooseMany: (message, options, initial) => {
      asked.push({ values: options.map((option) => option.value), initial });
      return base.chooseMany(message, options, initial);
    },
  };
  return { terminal, asked };
}

describe("the agents init offers in this version", () => {
  it("AC1: asks a person only about Claude Code and Antigravity, and checks only those detected", async () => {
    const root = await tempRepo({ ...CODE, ...CURSOR, ...ANTIGRAVITY });
    const { terminal, asked } = recording();
    const done = await released(root, ["init", "--language", "es"], { terminal });
    expect(done.code).toBe(0);
    expect(asked[0]).toEqual({ values: ["claude-code", "antigravity"], initial: ["antigravity"] });
    expect(await has(root, ".agents/hooks.json")).toBe(true);
    expect(await has(root, ".cursor/hooks.json")).toBe(false);
  });

  it("AC2: with nobody to ask, leaves out a disabled agent the repository's files show", async () => {
    const root = await tempRepo({ ...CODE, ...CURSOR });
    const done = await released(root, ["init", "--language", "es"]);
    expect(done.code).toBe(0);
    expect(await has(root, ".cursor/hooks.json")).toBe(false);
    expect(await claudeGuard(root)).toBe(true);
    expect(done.out).toContain(NO_AGENT);
  });

  it("AC2: leaves out a disabled agent that runs it", async () => {
    const root = await tempRepo(CODE);
    const done = await released(root, ["init", "--language", "es"], {
      env: { CODEX_THREAD_ID: "019a-hilo" },
    });
    expect(done.code).toBe(0);
    expect(await has(root, ".codex/hooks.json")).toBe(false);
    expect(await claudeGuard(root)).toBe(true);
    expect(done.out).toContain(NO_AGENT);
  });

  it("AC4: registers the MCP server only in the enabled agents it installs", async () => {
    const root = await tempRepo({ ...CODE, ...CURSOR, "CLAUDE.md": "@AGENTS.md\n" });
    const done = await released(root, ["init", "--language", "es", "--mcp"], {
      invocation: { command: "specty", portable: true },
    });
    expect(done.code).toBe(0);
    const mcp = JSON.parse(await read(root, ".mcp.json"));
    expect(mcp.mcpServers.specty).toEqual({ command: "specty", args: ["mcp"] });
    expect(await has(root, ".cursor/mcp.json")).toBe(false);
    expect(done.out).not.toContain(".cursor/mcp.json");
  });

  it("AC5: uninstall still removes the guard of a disabled agent", async () => {
    const root = await tempRepo(CODE);
    const init = await cli(root, ["init", "--language", "es", "--tools", "claude-code,cursor"]);
    expect(init.code).toBe(0);
    expect(await read(root, ".cursor/hooks.json")).toContain("guard --tool cursor");
    const terminal = person({ choose: ["yes"] });
    const removed = await released(root, ["uninstall"], { terminal });
    expect(removed.code).toBe(0);
    expect(await has(root, ".cursor/hooks.json")).toBe(false);
  });
});
