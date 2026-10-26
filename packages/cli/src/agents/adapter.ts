// SPDX-License-Identifier: Apache-2.0
import type { DoctorLine, Lang } from "@baquia-dev/specty-core";
import type { GuardReply, GuardTool, RawAction } from "../enforce/actions";
import type { InstallFiles } from "../install/files";
import { isRecord } from "../io/files";
import type { Git } from "../io/git";
import type { Invocation } from "../session";

type Event = Readonly<Record<string, unknown>>;

/** A change to a JSON settings file, from its top-level object to the new one. */
export type JsonUpdate = (value: Record<string, unknown>) => Record<string, unknown>;

/**
 * What an event of an agent's hooks is: before an action, after a shell command, a session that
 * starts again after a compaction, or Claude Code making or removing a worktree.
 */
type EventKind = "before" | "after" | "compact" | "worktree";

/** The guard's verdict before each agent's form: let it through, or stop it and say why. */
export type Verdict =
  | { readonly allow: true }
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
  readonly kind: (event: Event) => EventKind;
  /** The action an event before it describes. Paths are still as the tool sent them. */
  readonly action: (event: Event) => RawAction;
  /** The reply before an action, or after a shell command. */
  readonly reply: (verdict: Verdict, phase: "before" | "after") => GuardReply;
  /** The reply when the guard itself fails: the action goes through, with every agent. */
  readonly failed: (message: string) => GuardReply;
  /** The reply that brings the task card back after a compaction, for an agent that can. */
  readonly card?: (text: string) => GuardReply;
  /** Its end of turn, for an agent whose end of turn can send it back to work (ADR 0012). */
  readonly stop?: AgentStop;
  /** Writes its guard and its settings in the repository, never in the user's folder (ADR 0013). */
  readonly install: (context: InstallContext) => Promise<Installed>;
  /** Takes them out again for `uninstall`, and leaves everything else as it was. */
  readonly remove: (root: string, files: InstallFiles) => Promise<void>;
  /** What `doctor` finds in place and what it finds missing. */
  readonly doctor: (root: string) => Promise<DoctorLines>;
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

/** `specty hook agent-stop <agent>`: when it runs, what it answers, and where it goes. */
export interface AgentStop {
  /** Whether this end of turn is one to check. */
  readonly acts: (event: Event) => boolean;
  /** What sends the agent back to work with the report. */
  readonly reply: (message: string) => string;
  /** The files where `check --install` puts the hook, next to Specty's guard. */
  readonly files: readonly string[];
  /** Adds the hook, with the command that runs it and the time limit in seconds. */
  readonly hook: (command: string, timeout: number) => JsonUpdate;
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
    files,
    hook: (command, timeout) => (value) => {
      const hooks = isRecord(value.hooks) ? value.hooks : {};
      const current: unknown[] = Array.isArray(hooks.Stop) ? hooks.Stop : [];
      const entry = { hooks: [{ type: "command", command, timeout }] };
      return { ...value, hooks: { ...hooks, Stop: [...current, entry] } };
    },
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
