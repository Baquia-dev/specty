// SPDX-License-Identifier: Apache-2.0
import type { AgentTool } from "../agents";
import type { Phase } from "../flow/phases";
import type { Lang } from "../i18n";
import type { ResolvedConfig } from "../schema/config";
import type { ChangeKind } from "../spec/model";
import type { GuardIntegration } from "./integration";
import type { BoundSession } from "./session";
import type { Elsewhere, ForeignPath, GhostPath, OpenFolder } from "./worktrees";

export interface GuardChange {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly phase: Phase;
  readonly closingSubmitted: boolean;
  /** Repository-relative path of the change's `spec.md`. */
  readonly specPath: string;
  readonly task?: {
    readonly id: string;
    readonly files: readonly string[];
    readonly extras: readonly string[];
  };
  /** In the testing phase, the files of the approved spec: only their tests may be written. */
  readonly files?: readonly string[];
  /** The tests the person approved: nobody writes or deletes them (ADR 0014). */
  readonly locked?: readonly string[];
  /** A pending incorporation of the main branch: it alone decides about code, in any phase. */
  readonly integration?: GuardIntegration;
  /** The change waits for the person's decision, as `specty wait` reads it. */
  readonly waiting?: boolean;
}

export interface GuardContext {
  readonly config: ResolvedConfig;
  readonly lang: Lang;
  readonly change?: GuardChange;
  /** How messages tell the agent to call Specty, for example `specty`. */
  readonly command: string;
  /** The person delegated their decisions to the agent (ADR 0010): their commands are open. */
  readonly delegated?: boolean;
  /** The agent's tool, for the way each one runs `specty wait`. */
  readonly tool?: AgentTool;
}

/** Facts about a shell command, with paths already relative to the repository root. */
export interface ShellFacts {
  readonly specty: readonly string[];
  readonly unscopedNpx: boolean;
  readonly bypass: boolean;
  /** The branches its git commands write, delete, push or check out; `*` for all or unknown. */
  readonly refs?: readonly string[];
  /** Governed files that a `git commit` in the command would include. */
  readonly committedGoverned: readonly string[];
  readonly writes: readonly string[];
  readonly deletes: readonly string[];
  /** What the command would change inside another worktree of the repository. */
  readonly foreign?: readonly ForeignPath[];
  /** What the command would write or delete in a ghost folder, which git no longer knows. */
  readonly ghosts?: readonly GhostPath[];
  /** The command would run outside the change's folder the conversation entered. */
  readonly elsewhere?: Elsewhere;
  /** The folders of open changes its `git worktree remove` commands would remove. */
  readonly removedFolders?: readonly OpenFolder[];
  /** One of its simple commands waits with `sleep`. */
  readonly sleeps?: boolean;
  /**
   * Whether the tool runs it in the background, for a tool whose shell says so (Claude Code's
   * `run_in_background`); undefined for the others.
   */
  readonly background?: boolean;
}

export type GuardAction =
  | {
      readonly kind: "write" | "delete";
      readonly paths: readonly string[];
      /** Paths inside another worktree of the repository, kept apart from `paths`. */
      readonly foreign?: readonly ForeignPath[];
      /** Paths inside a ghost folder, kept apart from `paths` too. */
      readonly ghosts?: readonly GhostPath[];
    }
  /**
   * What a tool reads or searches. Reading is free; only a conversation that entered a change's
   * folder reads that folder's files (`ForeignPath.instead`).
   */
  | {
      readonly kind: "read";
      readonly paths: readonly string[];
      readonly foreign?: readonly ForeignPath[];
    }
  | { readonly kind: "shell"; readonly facts: ShellFacts }
  /** An edit that writes and deletes files at once, such as a patch (Codex, OpenCode). */
  | ({ readonly kind: "files" } & Pick<ShellFacts, "writes" | "deletes" | "foreign" | "ghosts">)
  /**
   * The session moves into the worktree `target`, bound or not to another one. `epic` is the epic
   * of the open change in `target`, when that change is one of its slices.
   */
  | {
      readonly kind: "enter";
      readonly target: string;
      readonly bound?: BoundSession;
      readonly epic?: string;
    }
  /**
   * A tool of the agent's own removes a worktree (OpenCode's `worktree_remove`): `folders` are
   * the open changes' folders among what it removes.
   */
  | { readonly kind: "remove-worktree"; readonly folders: readonly OpenFolder[] }
  | { readonly kind: "other" };

/** The rule behind a denial, so a caller can pick the next step (`scope add` only for `scope`). */
export type GuardRule =
  | "human"
  | "package"
  | "bypass"
  | "memory"
  | "commit"
  | "protected"
  | "spec"
  | "no-change"
  | "phase"
  | "no-task"
  | "scope"
  | "worktree"
  | "ghost"
  | "change-folder"
  | "integration"
  | "session"
  | "locked"
  | "wait";

export type GuardDecision =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly rule: GuardRule;
      readonly reason: string;
      readonly next: string;
    };
