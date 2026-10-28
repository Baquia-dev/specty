// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type AgentTool,
  type DoctorLine,
  type Lang,
  mcpNotOnPathWarning,
  mcpRegisteredLine,
  mcpUserFolderWarning,
} from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import { isRecord, readText } from "../io/files";
import { COMMAND, type Invocation } from "../session";
import { removeFromJson } from "./agents";
import { type InstallFiles, rewriteJson } from "./files";

/**
 * Specty's MCP server (`specty mcp`) in each agent's project configuration (ARCHITECTURE §6):
 * where each agent reads it, and how `init --mcp` writes it, `doctor` finds it and `uninstall`
 * takes it out. Only this table knows the files.
 */

type Format = "mcpServers" | "opencode" | "codex";

interface Target {
  readonly tool: AgentTool;
  readonly file: string;
  readonly format: Format;
}

/** Each agent's project file, as its documentation says (2026-10-28); Antigravity has none. */
const TARGETS: readonly Target[] = [
  { tool: "claude-code", file: ".mcp.json", format: "mcpServers" },
  { tool: "cursor", file: ".cursor/mcp.json", format: "mcpServers" },
  { tool: "gemini-cli", file: ".gemini/settings.json", format: "mcpServers" },
  { tool: "opencode", file: "opencode.json", format: "opencode" },
  { tool: "windsurf", file: ".devin/config.json", format: "mcpServers" },
  { tool: "codex", file: ".codex/config.toml", format: "codex" },
];

/** The key that holds the servers in each JSON format. */
const SERVERS = { mcpServers: "mcpServers", opencode: "mcp" } as const;
const TOML_HEADER = "[mcp_servers.specty]";
const TOML_BLOCK = `${TOML_HEADER}\ncommand = "${COMMAND}"\nargs = ["mcp"]\n`;

/** Specty's entry as a JSON format writes it. */
function entryOf(format: "mcpServers" | "opencode"): Record<string, unknown> {
  return format === "opencode"
    ? { type: "local", command: [COMMAND, "mcp"], enabled: true }
    : { command: COMMAND, args: ["mcp"] };
}

/**
 * `init --mcp`: the entry in the file of each agent of `tools` that has one, when `specty` is on
 * the PATH; and what Antigravity, which reads only the user's folder, needs from the person.
 */
export async function installMcp(options: {
  readonly root: string;
  readonly tools: readonly AgentTool[];
  readonly invocation: Invocation;
  readonly files: InstallFiles;
  readonly lang: Lang;
}): Promise<{ readonly done: string[]; readonly warnings: string[]; readonly written: string[] }> {
  const { root, tools, invocation, files, lang } = options;
  const warnings = tools.includes("antigravity") ? [mcpUserFolderWarning(lang)] : [];
  const targets = TARGETS.filter((target) => tools.includes(target.tool));
  if (targets.length === 0) return { done: [], warnings, written: [] };
  if (!invocation.portable) {
    return { done: [], warnings: [...warnings, mcpNotOnPathWarning(COMMAND, lang)], written: [] };
  }
  for (const target of targets) await write(root, target, files);
  return {
    done: [mcpRegisteredLine(targets, lang)],
    warnings,
    written: targets.map((target) => target.file),
  };
}

async function write(root: string, target: Target, files: InstallFiles): Promise<void> {
  const path = join(root, target.file);
  if (target.format === "codex") {
    const text = (await files.read(path)) ?? "";
    await files.write(path, withTomlBlock(text));
    return;
  }
  const key = SERVERS[target.format];
  const entry = entryOf(target.format);
  await rewriteJson(
    path,
    (value) => ({
      ...value,
      [key]: { ...(isRecord(value[key]) ? value[key] : {}), specty: entry },
    }),
    true,
    files,
  );
}

/** `text` with Specty's TOML table, in place of the one there was or after the rest. */
function withTomlBlock(text: string): string {
  const { before, after, found } = tomlParts(text);
  if (found) return `${before}${TOML_BLOCK}${after}`;
  if (text.trim() === "") return TOML_BLOCK;
  return `${text.endsWith("\n") ? text : `${text}\n`}\n${TOML_BLOCK}`;
}

/** The text around Specty's TOML table: from its header to the next table, or to the end. */
function tomlParts(text: string): {
  readonly before: string;
  readonly block: string;
  readonly after: string;
  readonly found: boolean;
} {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === TOML_HEADER);
  if (start === -1) return { before: text, block: "", after: "", found: false };
  const next = lines.findIndex((line, index) => index > start && line.trim().startsWith("["));
  const end = next === -1 ? lines.length : next;
  return {
    before: lines.slice(0, start).join("\n") + (start > 0 ? "\n" : ""),
    block: lines.slice(start, end).join("\n"),
    after: end < lines.length ? lines.slice(end).join("\n") : "",
    found: true,
  };
}

type State = "absent" | "ours" | "other";

/** Whether the target's file has Specty's entry, and whether it runs `specty mcp`. */
async function stateOf(root: string, target: Target): Promise<State> {
  const text = await readText(join(root, target.file));
  if (text === undefined) return "absent";
  if (target.format === "codex") {
    const { block, found } = tomlParts(text);
    if (!found) return "absent";
    return block.includes(`command = "${COMMAND}"`) && block.includes('args = ["mcp"]')
      ? "ours"
      : "other";
  }
  const value: unknown = parse(text);
  const servers = isRecord(value) ? value[SERVERS[target.format]] : undefined;
  const entry = isRecord(servers) ? servers.specty : undefined;
  if (entry === undefined) return "absent";
  return JSON.stringify(entry) === JSON.stringify(entryOf(target.format)) ? "ours" : "other";
}

/**
 * What `doctor` says of the server. The repository asked for it when some agent's file has the
 * entry: then each agent of `tools` should have it, running `specty mcp`. Without any, nothing.
 */
export async function mcpDoctor(
  root: string,
  tools: readonly AgentTool[],
): Promise<{
  readonly ok: DoctorLine[];
  readonly problems: DoctorLine[];
  readonly warnings: DoctorLine[];
}> {
  const states = await Promise.all(
    TARGETS.map(async (target) => ({ target, state: await stateOf(root, target) })),
  );
  if (states.every(({ state }) => state === "absent"))
    return { ok: [], problems: [], warnings: [] };
  const used = states.filter(({ target }) => tools.includes(target.tool));
  const line = (
    code: "mcp-registered" | "mcp-missing" | "mcp-other",
    target: Target,
  ): DoctorLine => ({ code, tool: target.tool, file: target.file });
  return {
    ok: used
      .filter(({ state }) => state === "ours")
      .map(({ target }) => line("mcp-registered", target)),
    problems: used.flatMap(({ target, state }): DoctorLine[] => {
      if (state === "ours") return [];
      return [line(state === "other" ? "mcp-other" : "mcp-missing", target)];
    }),
    warnings: tools.includes("antigravity")
      ? [{ code: "mcp-user-folder", tool: "antigravity" }]
      : [],
  };
}

/** `uninstall`: Specty's entry out of every agent's file; a file left empty goes. */
export async function removeMcp(root: string, files: InstallFiles): Promise<void> {
  for (const target of TARGETS) {
    if (target.format === "codex") {
      await removeTomlBlock(join(root, target.file), files);
      continue;
    }
    const key = SERVERS[target.format];
    await removeFromJson(
      root,
      target.file,
      (value) => {
        const servers = value[key];
        if (!isRecord(servers) || !("specty" in servers)) return value;
        const { specty: _specty, ...others } = servers;
        const { [key]: _servers, ...rest } = value;
        return Object.keys(others).length === 0 ? rest : { ...rest, [key]: others };
      },
      files,
    );
  }
}

async function removeTomlBlock(path: string, files: InstallFiles): Promise<void> {
  const text = await files.read(path);
  if (text === undefined) return;
  const { before, after, found } = tomlParts(text);
  if (!found) return;
  const left = `${before.replace(/\n+$/, "\n")}${after}`;
  if (left.trim() === "") await files.remove(path);
  else await files.write(path, left.startsWith("\n") ? left.slice(1) : left);
}
