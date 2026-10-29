// SPDX-License-Identifier: Apache-2.0
// What an agent tells of its session, the model and the effort it works with, for the audit
// (formats.md §4): context, not proof, like the tool it declares. Today only Claude Code tells them.
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentTool } from "@baquia-dev/specty-core";
import { isRecord, parseJson } from "../io/files";

export interface AgentRun {
  /** The agent's session id: what tells which of its sessions worked on a change. */
  readonly session?: string;
  readonly model?: string;
  readonly effort?: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** How much of a transcript's end is read: its last answers, never the whole session. */
const TAIL_BYTES = 64 * 1024;
/** A session id names a file: no separators, so it cannot lead anywhere else. */
const SESSION = /^[\w-]+$/;
const EFFORT = /^[a-z]+$/;
/** A model's name in an answer; Claude Code's own messages say `<synthetic>`, which is none. */
const MODEL = /"model":"([^"<>]+)"/g;

/** The session, the model and the effort of the agent that runs the command, when it tells them. */
export async function agentRun(tool: AgentTool | undefined, env: Env): Promise<AgentRun> {
  if (tool !== "claude-code") return {};
  const effort = env.CLAUDE_EFFORT;
  const session = env.CLAUDE_CODE_SESSION_ID;
  const named = session !== undefined && SESSION.test(session) ? session : undefined;
  const model = named === undefined ? undefined : await claudeModel(named, env);
  return {
    ...(named === undefined ? {} : { session: named }),
    ...(model === undefined ? {} : { model }),
    ...(effort !== undefined && EFFORT.test(effort) ? { effort } : {}),
  };
}

/**
 * The tokens the last answer of Claude Code's `session` read: its prompt, with all the context the
 * session carries. Undefined when the id is not a name or its transcript does not tell.
 */
export async function sessionContext(session: string, env: Env): Promise<number | undefined> {
  if (!SESSION.test(session)) return undefined;
  const lines = (await transcriptTail(session, env))?.split("\n").reverse() ?? [];
  for (const line of lines) {
    const read = promptOf(parseJson(line));
    if (read !== undefined) return read;
  }
  return undefined;
}

/** The model of the last answer in Claude Code's transcript of `session`. */
async function claudeModel(session: string, env: Env): Promise<string | undefined> {
  const tail = await transcriptTail(session, env);
  return tail === undefined ? undefined : [...tail.matchAll(MODEL)].at(-1)?.[1];
}

/**
 * The end of Claude Code's transcript of `session`: it does not pass the model or the context to
 * its commands, only the session's id, and keeps each session in
 * `projects/<folder>/<session>.jsonl` of its configuration folder.
 */
async function transcriptTail(session: string, env: Env): Promise<string | undefined> {
  const projects = join(
    env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? homedir(), ".claude"),
    "projects",
  );
  const folders = await readdir(projects).catch(() => []);
  for (const folder of folders) {
    const tail = await tailOf(join(projects, folder, `${session}.jsonl`));
    if (tail !== undefined) return tail;
  }
  return undefined;
}

/**
 * What an answer of the transcript read: its input, cache writes and cache reads. Claude Code's
 * own messages read nothing, and the first line of a tail is usually cut.
 */
function promptOf(entry: unknown): number | undefined {
  if (!isRecord(entry) || entry.type !== "assistant" || !isRecord(entry.message)) return undefined;
  const { usage } = entry.message;
  if (!isRecord(usage)) return undefined;
  const counts = [
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
  ];
  if (!counts.every((count): count is number => typeof count === "number")) return undefined;
  const read = counts.reduce((total, count) => total + count, 0);
  return read > 0 ? read : undefined;
}

/** The last bytes of a file; none when it cannot be read. */
async function tailOf(path: string): Promise<string | undefined> {
  const handle = await open(path, "r").catch(() => undefined);
  if (handle === undefined) return undefined;
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}
