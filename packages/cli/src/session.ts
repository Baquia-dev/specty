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
import { type RepoPaths, repoPaths } from "./store/paths";

/** Questions to a person. Implementations must not answer on their own. */
export interface Terminal {
  /** stdin and stdout are a TTY: a person can answer. No variable overrides it. */
  readonly interactive: boolean;
  confirm(message: string): Promise<boolean>;
  choose<T extends string>(
    message: string,
    options: readonly { readonly value: T; readonly label: string }[],
  ): Promise<T | undefined>;
  ask(message: string): Promise<string | undefined>;
  /** Shows information to the person (summaries before a decision). */
  note(title: string, text: string): void;
}

export interface Io {
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
  return { kind: "ok", session: sessionFrom(environment, root, paths, git, loaded.config) };
}

export function sessionFrom(
  environment: Environment,
  root: string,
  paths: RepoPaths,
  git: Git,
  config: ResolvedConfig,
): Session {
  const tool = detectAgentTool(environment.env);
  const lang = config.language;
  return {
    environment,
    root,
    paths,
    git,
    config,
    lang,
    tool,
    actor: environment.terminal.interactive ? "human" : "agent",
    cards: {
      lang,
      command: COMMAND,
      ...(tool !== undefined ? { tool } : {}),
      quickMaxFiles: config.lanes.quick.maxFiles,
      implicitTests: config.scope.implicitTests,
    },
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
