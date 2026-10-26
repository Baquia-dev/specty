// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { codexHooksFile } from "../install/agents";
import { installFiles, rewriteJson } from "../install/files";
import { isRecord, readText } from "../io/files";
import type { Session } from "../session";

/**
 * The agents' end-of-turn hook for `specty check --install` (ADR 0012): next to Specty's guard,
 * in the same file and with the same command, each agent that has an end of turn which sends it
 * back to work gets `specty hook agent-stop <agent>`. Claude Code and Codex call it from `Stop`,
 * Cursor from `stop`. An agent without the guard gets nothing, and one that has the hook, nothing
 * again.
 */

/** An edit of an agent's file: repository-relative, or absolute outside the repository (Codex). */
export interface AgentEdit {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

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

export async function agentStopEdits(session: Session): Promise<AgentEdit[]> {
  const { root } = session;
  const targets: readonly (readonly [string, string, string, Hook])[] = [
    [join(root, ".claude/settings.json"), ".claude/settings.json", "claude-code", stopHook("Stop")],
    [
      join(root, ".claude/settings.local.json"),
      ".claude/settings.local.json",
      "claude-code",
      stopHook("Stop"),
    ],
    [join(root, ".cursor/hooks.json"), ".cursor/hooks.json", "cursor", cursorHook],
  ];
  const codex = codexHooksFile(session.environment.env);
  const all = [...targets, [codex, codex, "codex", stopHook("Stop")] as const];
  const found = await Promise.all(
    all.map(([file, shown, tool, hook]) =>
      edit(file, shown, tool, hook, session.config.verify.timeoutSec),
    ),
  );
  return found.flatMap((item) => (item === undefined ? [] : [item]));
}

async function edit(
  file: string,
  shown: string,
  tool: string,
  hook: Hook,
  timeout: number,
): Promise<AgentEdit | undefined> {
  const before = await readText(file);
  if (before === undefined || before.includes(`hook agent-stop ${tool}`)) return undefined;
  const prefix = guardPrefix(before, tool);
  if (prefix === undefined) return undefined;
  // Planned without writing, to show its diff first.
  const files = installFiles({ dryRun: true });
  await rewriteJson(file, hook(`${prefix} hook agent-stop ${tool}`, timeout), false, files);
  const after = await files.read(file);
  return after === undefined || after === before ? undefined : { path: shown, before, after };
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
