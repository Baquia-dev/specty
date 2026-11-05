// SPDX-License-Identifier: Apache-2.0

/**
 * An agent's conversation in the repository, as `GET /api/sessions` of `specty ui` gives it (ADR
 * 0016): where and when it stepped, whether it still works, and what it spent when Specty knows.
 */
export interface SessionView {
  /** The agent, such as `claude-code` or `codex`. */
  readonly tool: string;
  /** The conversation's id, as the agent's hooks send it. */
  readonly conversation: string;
  /** The folder of its last step, relative to the main folder; empty for the main folder. */
  readonly folder: string;
  /** The open change whose folder that is. */
  readonly change?: string;
  /** ISO 8601, in UTC: its first step. */
  readonly first: string;
  /** ISO 8601, in UTC: its last step. */
  readonly last: string;
  /** It stepped within `memory.orphanAfterMin` minutes. */
  readonly live: boolean;
  /** What it spent so far, when ccusage tells it: tokens of every kind, and US dollars. */
  readonly usage?: { readonly tokens: number; readonly cost: number };
}
