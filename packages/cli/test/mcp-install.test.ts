// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@baquia-dev/specty-core";
import { describe, expect, it } from "vitest";
import { installFiles } from "../src/install/files";
import { installMcp } from "../src/install/mcp";
import { cli, person, read, tempRepo, writeFiles } from "./support";

/** Each agent's MCP file with something of the person's already in it. */
const THEIRS = {
  ".mcp.json": '{\n  "mcpServers": { "other": { "command": "other-server" } }\n}\n',
  "opencode.json": '{\n  "$schema": "https://opencode.ai/config.json"\n}\n',
  ".codex/config.toml": 'model = "o3"\n',
};
const ALL: readonly AgentTool[] = [
  "claude-code",
  "cursor",
  "gemini-cli",
  "opencode",
  "windsurf",
  "codex",
];
const SPECTY = { command: "specty", args: ["mcp"] };
const TOML = '[mcp_servers.specty]\ncommand = "specty"\nargs = ["mcp"]\n';

/** Specty's MCP server registered for `tools`, with `specty` on the PATH or not. */
const register = (root: string, tools: readonly AgentTool[], portable = true) =>
  installMcp({
    root,
    tools,
    invocation: portable
      ? { command: "specty", portable: true }
      : { command: 'node "/x/specty.mjs"', portable: false, script: "/x/specty.mjs" },
    files: installFiles(),
    lang: "es",
  });

const json = async (root: string, path: string) => JSON.parse(await read(root, path));

describe("init --mcp", () => {
  it("AC1: registers `specty mcp` in each agent's project MCP file, keeping what was there", async () => {
    const root = await tempRepo(THEIRS);
    const installed = await register(root, ALL);
    expect((await json(root, ".mcp.json")).mcpServers).toEqual({
      other: { command: "other-server" },
      specty: SPECTY,
    });
    expect((await json(root, ".cursor/mcp.json")).mcpServers.specty).toEqual(SPECTY);
    expect((await json(root, ".gemini/settings.json")).mcpServers.specty).toEqual(SPECTY);
    expect((await json(root, ".devin/config.json")).mcpServers.specty).toEqual(SPECTY);
    expect(await json(root, "opencode.json")).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: { specty: { type: "local", command: ["specty", "mcp"], enabled: true } },
    });
    expect(await read(root, ".codex/config.toml")).toBe(`model = "o3"\n\n${TOML}`);
    expect(installed.done).toEqual([
      "Servidor MCP de Specty (`specty mcp`) registrado: Claude Code (.mcp.json), Cursor (.cursor/mcp.json), Gemini CLI (.gemini/settings.json), OpenCode (opencode.json), Devin (Windsurf) (.devin/config.json), Codex (.codex/config.toml).",
    ]);
    expect(installed.written).toEqual([
      ".mcp.json",
      ".cursor/mcp.json",
      ".gemini/settings.json",
      "opencode.json",
      ".devin/config.json",
      ".codex/config.toml",
    ]);
    // Again, nothing changes: the TOML block is not repeated.
    await register(root, ALL);
    expect(await read(root, ".codex/config.toml")).toBe(`model = "o3"\n\n${TOML}`);
  });

  it("AC2: writes nothing without `specty` on the PATH, and points Antigravity to its folder", async () => {
    const root = await tempRepo({ "README.md": "x\n" });
    const off = await register(root, ["claude-code"], false);
    expect(off.warnings).toEqual([
      "El servidor MCP no se registró: necesita `specty` en el PATH. Instálalo con `npm install -g @baquia-dev/specty` y vuelve a ejecutar `specty init --mcp`.",
    ]);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
    const antigravity = await register(root, ["antigravity"]);
    expect(antigravity.warnings).toEqual([
      "Antigravity solo lee los servidores MCP de la carpeta del usuario: añade allí, en «Manage MCP Servers», el servidor `specty` con el comando `specty mcp`.",
    ]);
    expect(antigravity.done).toEqual([]);

    const run = await cli(root, ["init", "--language", "es", "--tools", "claude-code", "--mcp"]);
    expect(run.code).toBe(0);
    expect(run.out).toContain("El servidor MCP no se registró: necesita `specty` en el PATH.");
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });

  it("AC3: plain init writes no MCP entry", async () => {
    const root = await tempRepo({ "README.md": "x\n" });
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    expect(existsSync(join(root, ".mcp.json"))).toBe(false);
  });
});

describe("doctor and uninstall", () => {
  it("AC4: doctor confirms the server, asks for it where it is missing or wrong, and says nothing without it", async () => {
    const root = await tempRepo({ "README.md": "x\n" });
    const tools = "claude-code,cursor,antigravity";
    expect((await cli(root, ["init", "--language", "es", "--tools", tools])).code).toBe(0);
    expect((await cli(root, ["doctor"])).out).not.toContain("MCP");

    await register(root, ["claude-code"]);
    const doctor = await cli(root, ["doctor"]);
    expect(doctor.out).toContain("Claude Code: servidor MCP de Specty registrado (.mcp.json).");
    expect(doctor.out).toContain(
      "Cursor: falta el servidor MCP de Specty en .cursor/mcp.json; ejecuta `specty init --mcp`.",
    );
    expect(doctor.out).toContain(
      "Antigravity: solo lee los servidores MCP de la carpeta del usuario; añade allí `specty mcp` en «Manage MCP Servers».",
    );
    await writeFiles(root, {
      ".mcp.json": '{ "mcpServers": { "specty": { "command": "otro", "args": ["mcp"] } } }\n',
    });
    expect((await cli(root, ["doctor"])).out).toContain(
      "Claude Code: el servidor MCP «specty» de .mcp.json no ejecuta `specty mcp`; ejecuta `specty init --mcp`.",
    );
  });

  it("AC5: uninstall takes the entry out of each file and deletes the files left empty", async () => {
    const root = await tempRepo(THEIRS);
    expect((await cli(root, ["init", "--language", "es", "--tools", "claude-code"])).code).toBe(0);
    await register(root, ALL);
    // Removing is the person's explicit choice: the default option keeps everything.
    const removed = await cli(root, ["uninstall"], { terminal: person({ choose: ["yes"] }) });
    expect(removed.code, removed.out).toBe(0);
    expect((await json(root, ".mcp.json")).mcpServers).toEqual({
      other: { command: "other-server" },
    });
    expect(await json(root, "opencode.json")).toEqual({
      $schema: "https://opencode.ai/config.json",
    });
    expect(await read(root, ".codex/config.toml")).toBe('model = "o3"\n');
    expect(existsSync(join(root, ".cursor/mcp.json"))).toBe(false);
    expect(existsSync(join(root, ".devin/config.json"))).toBe(false);
  });
});
