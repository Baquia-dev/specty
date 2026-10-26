// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { ADAPTERS } from "../agents";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord } from "../io/files";
import type { Session } from "../session";

/**
 * The agents' end-of-turn hook for `specty check --install` (ADR 0012): next to Specty's guard,
 * in the same file and with the same command, each agent that has an end of turn which sends it
 * back to work gets `specty hook agent-stop <agent>`, where and as its module says (`agents/`).
 * An agent without the guard gets nothing, and one that has the hook, nothing again.
 */

/** Plans the hook into `files`, the plan's files, for each agent whose guard is there. */
export async function agentStopHooks(session: Session, files: InstallFiles): Promise<void> {
  for (const { tool, stop } of Object.values(ADAPTERS)) {
    if (stop === undefined) continue;
    for (const path of stop.files) {
      const file = join(session.root, path);
      const text = await files.read(file);
      if (text === undefined || text.includes(`hook agent-stop ${tool}`)) continue;
      const prefix = guardPrefix(text, tool);
      if (prefix === undefined) continue;
      const command = `${prefix} hook agent-stop ${tool}`;
      await rewriteJson(file, stop.hook(command, session.config.verify.timeoutSec), false, files);
    }
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
