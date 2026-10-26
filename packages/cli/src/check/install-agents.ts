// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { codexHooksFile } from "../install/agents";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord } from "../io/files";
import type { Session } from "../session";

/**
 * The agents' end-of-turn hook for `specty check --install` (ADR 0012): next to Specty's guard,
 * in the same file and with the same command, each agent that has an end of turn which sends it
 * back to work gets `specty hook agent-stop <agent>`. Claude Code and Codex call it from `Stop`,
 * Cursor from `stop`. An agent without the guard gets nothing, and one that has the hook, nothing
 * again.
 */

type Entry = Record<string, unknown>;

/** Builds the hook entry from the command that runs it and the session's time limit. */
type Hook = (command: string, timeout: number) => (value: Entry) => Entry;

const stopHook =
  (event: string): Hook =>
  (command, timeout) =>
  (value) => {
    const hooks = isRecord(value.hooks) ? value.hooks : {};
    const current: unknown[] = Array.isArray(hooks[event]) ? hooks[event] : [];
    const entry = { hooks: [{ type: "command", command, timeout }] };
    return { ...value, hooks: { ...hooks, [event]: [...current, entry] } };
  };

const cursorHook: Hook = (command) => (value) => {
  const hooks = isRecord(value.hooks) ? value.hooks : {};
  const current: unknown[] = Array.isArray(hooks.stop) ? hooks.stop : [];
  return { ...value, hooks: { ...hooks, stop: [...current, { command }] } };
};

/** Plans the hook into `files`, the plan's files, for each agent whose guard is there. */
export async function agentStopHooks(session: Session, files: InstallFiles): Promise<void> {
  const { root } = session;
  const targets: readonly (readonly [string, string, Hook])[] = [
    [join(root, ".claude/settings.json"), "claude-code", stopHook("Stop")],
    [join(root, ".claude/settings.local.json"), "claude-code", stopHook("Stop")],
    [join(root, ".cursor/hooks.json"), "cursor", cursorHook],
    [codexHooksFile(session.environment.env), "codex", stopHook("Stop")],
  ];
  for (const [file, tool, hook] of targets) {
    const text = await files.read(file);
    if (text === undefined || text.includes(`hook agent-stop ${tool}`)) continue;
    const prefix = guardPrefix(text, tool);
    if (prefix === undefined) continue;
    const command = `${prefix} hook agent-stop ${tool}`;
    await rewriteJson(file, hook(command, session.config.verify.timeoutSec), false, files);
  }
}

/** How the guard calls Specty in this file (`specty`, `node "<path>"`…), if it is there. */
function guardPrefix(text: string, tool: string): string | undefined {
  const marker = ` guard --tool ${tool}`;
  const command = commandsIn(parse(text)).find((candidate) => candidate.includes(marker));
  return command?.slice(0, command.indexOf(marker));
}

function commandsIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(commandsIn);
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    key === "command" && typeof item === "string" ? [item] : commandsIn(item),
  );
}
