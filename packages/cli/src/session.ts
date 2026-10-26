// SPDX-License-Identifier: Apache-2.0
import {
  type AgentTool,
  type CardContext,
  type ConfigIssue,
  detectAgentTool,
  type Lang,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { createGit, findRoot, type Git } from "./io/git";
import { loadConfig } from "./store/config";
import { readDelegation } from "./store/local";
import { type RepoPaths, repoPaths } from "./store/paths";

/**
 * Questions to a person. Implementations must not answer on their own, except the delegated
 * terminal, which answers for a person who delegated their decisions (`delegatedTerminal`).
 */
export interface Terminal {
  /** stdin and stdout are a TTY: a person can answer. No variable overrides it. */
  readonly interactive: boolean;
  /** Where the person decides: their terminal (the default) or the UI that `specty ui` serves. */
  readonly channel?: "tty" | "ui";
  confirm(message: string): Promise<boolean>;
  choose<T extends string>(
    message: string,
    options: readonly { readonly value: T; readonly label: string }[],
  ): Promise<T | undefined>;
  ask(message: string): Promise<string | undefined>;
  /** Shows information to the person (summaries before a decision). */
  note(title: string, text: string): void;
}

interface Io {
  out(text: string): void;
  err(text: string): void;
}

/** How agent and git hooks invoke this CLI: `specty`, or `node "<path>"` when not on PATH. */
export interface Invocation {
  readonly command: string;
  /** False when the command contains a machine-specific path. */
  readonly portable: boolean;
  /** Absolute path of the CLI script, when the command is not portable. */
  readonly script?: string;
}

export interface Environment {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly now: () => Date;
  readonly terminal: Terminal;
  readonly io: Io;
  readonly invocation: Invocation;
}

export interface Session {
  readonly environment: Environment;
  readonly root: string;
  readonly paths: RepoPaths;
  readonly git: Git;
  readonly config: ResolvedConfig;
  readonly lang: Lang;
  readonly tool: AgentTool | undefined;
  /** Who runs the command, for the audit log: a person at a TTY or an agent. */
  readonly actor: "agent" | "human";
  /** The person delegated their decisions to the agent: `specty delegate on` (ADR 0010). */
  readonly delegated: boolean;
  readonly cards: CardContext;
}

export type Opened =
  | { readonly kind: "no-git" }
  | {
      readonly kind: "missing";
      readonly root: string;
      readonly paths: RepoPaths;
      readonly git: Git;
    }
  | { readonly kind: "invalid"; readonly issues: readonly ConfigIssue[] }
  | { readonly kind: "ok"; readonly session: Session };

/** Name used in instructions; hooks use `Invocation.command` instead. */
export const COMMAND = "specty";

export async function openSession(environment: Environment): Promise<Opened> {
  const root = await findRoot(environment.cwd);
  if (root === undefined) return { kind: "no-git" };
  const paths = repoPaths(root);
  const git = createGit(root, environment.env);
  const loaded = await loadConfig(paths);
  if (loaded.kind === "missing") return { kind: "missing", root, paths, git };
  if (loaded.kind === "invalid") return { kind: "invalid", issues: loaded.issues };
  const delegated = (await readDelegation(git)) !== undefined;
  return {
    kind: "ok",
    session: sessionFrom(environment, root, paths, git, loaded.config, delegated),
  };
}

export function sessionFrom(
  environment: Environment,
  root: string,
  paths: RepoPaths,
  git: Git,
  config: ResolvedConfig,
  delegated = false,
): Session {
  const tool = detectAgentTool(environment.env);
  const lang = config.language;
  const { interactive } = environment.terminal;
  return {
    // With no person at the terminal, the delegated terminal answers for the one who delegated.
    environment:
      delegated && !interactive
        ? { ...environment, terminal: delegatedTerminal(environment.io) }
        : environment,
    root,
    paths,
    git,
    config,
    lang,
    tool,
    actor: interactive ? "human" : "agent",
    delegated,
    cards: {
      lang,
      command: COMMAND,
      ...(tool !== undefined ? { tool } : {}),
      quickMaxFiles: config.lanes.quick.maxFiles,
      implicitTests: config.scope.implicitTests,
      ...(delegated ? { delegated: true } : {}),
    },
  };
}

/**
 * Answers for a person who delegated their decisions (ADR 0010), in an agent's shell: it
 * confirms, never picks an option or writes a text for them, and shows the summaries on stderr,
 * so `--json` stays clean. It is still not interactive: delegating does not make the shell a person.
 */
function delegatedTerminal(io: Io): Terminal {
  return {
    interactive: false,
    confirm: async () => true,
    choose: async () => undefined,
    ask: async () => undefined,
    note: (title, text) => io.err(`${title}\n${text}`),
  };
}

/** Card context before a configuration exists (language from the system locale). */
export function bareCards(env: NodeJS.ProcessEnv): CardContext {
  return { lang: systemLanguage(env), command: COMMAND, quickMaxFiles: 3, implicitTests: true };
}

export function systemLanguage(env: NodeJS.ProcessEnv): Lang {
  const locale =
    env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return /^es\b|^es[_-]/i.test(locale) ? "es" : "en";
}
