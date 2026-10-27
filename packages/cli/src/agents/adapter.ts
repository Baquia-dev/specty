// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import type { DoctorLine, Lang } from "@baquia-dev/specty-core";
import { parse } from "jsonc-parser";
import type { GuardReply, GuardTool, RawAction } from "../enforce/actions";
import { type InstallFiles, rewriteJson } from "../install/files";
import { isRecord } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";

type Event = Readonly<Record<string, unknown>>;

/** A change to a JSON settings file, from its top-level object to the new one. */
export type JsonUpdate = (value: Record<string, unknown>) => Record<string, unknown>;

/**
 * What an event of an agent's hooks is: before an action, after a shell command, a session that
 * starts again after a compaction, a compaction about to happen that cannot take the card (it
 * waits for the conversation's next command), a model call about to happen, the first model call
 * of a turn (which brings the task card, for a tool that cannot say when it compacts), or Claude
 * Code making or removing a worktree.
 */
export type EventKind =
  | "before"
  | "after"
  | "compact"
  | "compacting"
  | "invocation"
  | "turn"
  | "worktree";

/**
 * Where a conversation's actions go: the folder of the change it entered (`specty enter`), or
 * otherwise its tool's own folder.
 */
export interface Redirect {
  readonly folder: string;
  /**
   * The same absolute path in that folder, for one in another worktree of the repository; any
   * other path stays as it is. Without a change entered, nothing moves.
   */
  readonly path: (absolute: string) => string;
}

/** The guard's verdict before each agent's form: let it through, or stop it and say why. */
export type Verdict =
  | {
      readonly allow: true;
      /**
       * The folders outside its workspace the action may write in, for an agent with `grants`: a
       * shell command's, and any action of a conversation that entered a change's folder.
       */
      readonly folders?: readonly string[];
      /** The folders outside its workspace that conversation's tools may read, too. */
      readonly readable?: readonly string[];
      /** The tool's input as the agent's module rewrote it (`redirect`), to send back. */
      readonly input?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly allow: false;
      readonly reason: string;
      /** The reason and the next step, as the agent reads them. */
      readonly text: string;
    };

/**
 * How Specty works with one agent that has its guard (ARCHITECTURE §10): what its hooks send and
 * the form each reply takes. The guard asks the agent's module instead of asking which tool it is.
 */
export interface AgentAdapter {
  readonly tool: GuardTool;
  /**
   * Brings the tool's event to the names the guard reads (`hook_event_name`, `session_id`, `cwd`,
   * `tool_name`, `tool_input`, `tool_use_id`), for a tool that calls them otherwise.
   */
  readonly normalize?: (event: Record<string, unknown>) => Record<string, unknown>;
  readonly kind: (event: Event) => EventKind;
  /** The action an event before it describes. Paths are still as the tool sent them. */
  readonly action: (event: Event) => RawAction;
  /**
   * The tool's whole input, rewritten so the action happens in the conversation's folder;
   * undefined when nothing changes. It reads the event as the tool sent it. The guard judges the
   * action with this input, and sends it back for the tool to run instead.
   */
  readonly redirect?: (event: Event, to: Redirect) => Record<string, unknown> | undefined;
  /**
   * The reply before an action, or after a shell command, with the card a compaction left for
   * it when there is one.
   */
  readonly reply: (verdict: Verdict, phase: "before" | "after", card?: string) => GuardReply;
  /** The reply when the guard itself fails: the action goes through, with every agent. */
  readonly failed: (message: string) => GuardReply;
  /**
   * Whether these hooks run inside another tool that loads them as its own (Devin loads Claude
   * Code's): that tool's own hooks answer, so the guard and the end of turn say nothing.
   */
  readonly borrowed?: (env: NodeJS.ProcessEnv) => boolean;
  /**
   * For a tool whose terminal sandbox keeps to the workspace and that takes permissions with each
   * action: every shell command the guard lets through brings Specty's folders (`Verdict.folders`).
   */
  readonly grants?: true;
  /** The reply that brings the task card back after a compaction, for an agent that can. */
  readonly card?: (text: string) => GuardReply;
  /**
   * For a tool whose hooks after a command cannot reach the model: the warning waits for the
   * conversation's next model call (`invocation`), which `inject` answers with it.
   */
  readonly late?: "invocation";
  /** The reply before a model call, with what waited for it; nothing to add is an empty list. */
  readonly inject?: (texts: readonly string[]) => GuardReply;
  /** Its end of turn, for an agent whose end of turn can send it back to work (ADR 0012). */
  readonly stop?: AgentStop;
  /** Writes its guard and its settings in the repository, never in the user's folder (ADR 0013). */
  readonly install: (context: InstallContext) => Promise<Installed>;
  /** Takes them out again for `uninstall`, and leaves everything else as it was. */
  readonly remove: (root: string, files: InstallFiles, git: Git) => Promise<void>;
  /** What `doctor` finds in place and what it finds missing. */
  readonly doctor: (root: string, git: Git) => Promise<DoctorLines>;
  /** Its guard in the user's folder, which Specty only reads: `uninstall` says it stays there. */
  readonly userFile?: (env: NodeJS.ProcessEnv) => string;
}

export interface DoctorLines {
  readonly ok: readonly DoctorLine[];
  readonly problems: readonly DoctorLine[];
}

/** Each check, as `doctor` reads it: whether it passed, and its line when it did and when not. */
export function doctorLines(
  checks: readonly (readonly [boolean, DoctorLine, DoctorLine])[],
): DoctorLines {
  return {
    ok: checks.filter(([passed]) => passed).map(([, good]) => good),
    problems: checks.filter(([passed]) => !passed).map(([, , bad]) => bad),
  };
}

/** Where `init` installs, and how it calls Specty. */
interface InstallContext {
  readonly root: string;
  readonly git: Git;
  readonly invocation: Invocation;
  readonly files: InstallFiles;
  readonly lang: Lang;
}

/** What an agent's install says in `init`'s output, and the files git tracks that it wrote. */
interface Installed {
  readonly done: readonly string[];
  readonly warnings: readonly string[];
  readonly written: readonly string[];
}

/** `specty hook agent-stop <agent>`: when it runs, what it answers, and how it is installed. */
export interface AgentStop {
  /** Whether this end of turn is one to check. */
  readonly acts: (event: Event) => boolean;
  /** What sends the agent back to work with the report. */
  readonly reply: (message: string) => string;
  /** What lets the turn end, for a tool that wants an answer every time; nothing otherwise. */
  readonly pass?: string;
  /**
   * For a tool that does not mark a turn it already sent back (`stop_hook_active`), Specty keeps
   * the count for each conversation: the end that comes after sending it back may go through.
   */
  readonly counts?: true;
  /**
   * Writes the hook into the plan of `check --install`, next to Specty's guard and with its
   * command; nothing when the guard is not there, or the hook already is.
   */
  readonly plan: (context: StopPlan) => Promise<void>;
}

/** What planning the end-of-turn hook takes: the time limit is in seconds. */
interface StopPlan {
  readonly root: string;
  readonly files: InstallFiles;
  readonly timeout: number;
  readonly tool: GuardTool;
}

/**
 * The end of turn of an agent whose hooks live in JSON files: in each of `files` that has
 * Specty's guard, `hook` adds `specty hook agent-stop <agent>` with the guard's own command.
 */
export function jsonStop(
  files: readonly string[],
  hook: (command: string, timeout: number) => JsonUpdate,
): AgentStop["plan"] {
  return async ({ root, files: planned, timeout, tool }) => {
    for (const path of files) {
      const file = join(root, path);
      const text = await planned.read(file);
      if (text === undefined || text.includes(`hook agent-stop ${tool}`)) continue;
      const prefix = guardPrefix(text, tool);
      if (prefix === undefined) continue;
      await rewriteJson(file, hook(`${prefix} hook agent-stop ${tool}`, timeout), false, planned);
    }
  };
}

/** How the guard calls Specty in a hooks file (`specty`, `node "<path>"`…), if it is there. */
function guardPrefix(text: string, tool: GuardTool): string | undefined {
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

/**
 * Claude Code's end of turn, which Codex shares: `Stop` goes back to work on `{ decision: "block",
 * reason }` and marks with `stop_hook_active` a turn it already sent back, which may end now so
 * that it never loops. The hook goes in `Stop`, with no matcher, in `files`.
 */
export function blockingStop(files: readonly string[]): AgentStop {
  return {
    acts: (event) => event.stop_hook_active !== true,
    reply: (message) => JSON.stringify({ decision: "block", reason: message }),
    plan: jsonStop(files, (command, timeout) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.Stop) ? hooks.Stop : [];
      const entry = { hooks: [{ type: "command", command, timeout }] };
      return { ...value, hooks: { ...hooks, Stop: [...current, entry] } };
    }),
  };
}

/**
 * Claude Code's form, which Codex and Specty's OpenCode plugin share: exit 2 with the text on
 * stderr stops the action, or brings the warning to the model after a command.
 */
export function exitReply(verdict: Verdict): GuardReply {
  return verdict.allow
    ? { code: 0, stdout: "", stderr: "" }
    : { code: 2, stdout: "", stderr: verdict.text };
}

/** The guard's own failure in that form: exit 1 with the message, which does not block. */
export function exitFailed(message: string): GuardReply {
  return { code: 1, stdout: "", stderr: message };
}

/** Claude Code's card after a compaction, which Codex shares: what stdout says goes to the context. */
export function textCard(text: string): GuardReply {
  return { code: 0, stdout: text, stderr: "" };
}
