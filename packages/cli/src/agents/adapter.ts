// SPDX-License-Identifier: Apache-2.0
import type { GuardReply, GuardTool, RawAction } from "../enforce/actions";

type Event = Readonly<Record<string, unknown>>;

/**
 * What an event of an agent's hooks is: before an action, after a shell command, a session that
 * starts again after a compaction, or Claude Code making or removing a worktree.
 */
export type EventKind = "before" | "after" | "compact" | "worktree";

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
