// SPDX-License-Identifier: Apache-2.0
import { relative, resolve, sep } from "node:path";
import {
  AGENT_NAMES,
  type AgentTool,
  agentChoices,
  agentQuestion,
  claudePointerLine,
  DEFAULT_CONFIG,
  detectAgentTool,
  gitHooksLine,
  gitHooksManualWarning,
  isGuardedAgent,
  type Lang,
  noAgentWarning,
  noHooksWarning,
  notOnPathWarning,
  type ResolvedConfig,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { Git } from "../io/git";
import { COMMAND, type Environment, offeredAgents } from "../session";
import type { InstallFiles } from "./files";
import { installGitHooks } from "./git-hooks";
import { writeClaudePointer } from "./project-files";

interface HooksInstall {
  /** What was installed, for init's output. */
  readonly done: readonly string[];
  readonly warnings: readonly string[];
  /** Repository-relative files written that git tracks: they go into init's commit. */
  readonly written: readonly string[];
}

/**
 * The agent tools `init` installs: the ones `given`; otherwise the ones a person at the terminal
 * checks, offered with those found already checked: the ones their files show (`detected`) and
 * the one running `init`, by its environment. If the person cancels, or nobody can be asked, the
 * ones found; with none, Claude Code's, and a warning when nobody could say. It only offers and
 * finds the agents this version offers (`offeredAgents`): `init` already refused any other given.
 */
export async function agentsToInstall(options: {
  readonly environment: Environment;
  readonly given: readonly AgentTool[] | undefined;
  readonly detected: readonly AgentTool[];
  readonly lang: Lang;
  readonly dryRun: boolean;
}): Promise<{ readonly tools: readonly AgentTool[]; readonly warnings: readonly string[] }> {
  const { environment, given, detected, lang } = options;
  if (given !== undefined) return { tools: given, warnings: [] };
  const offered = offeredAgents(environment);
  const running = detectAgentTool(environment.env);
  const all =
    running === undefined || detected.includes(running) ? detected : [...detected, running];
  const found = all.filter((tool) => offered.includes(tool));
  const { terminal } = environment;
  if (terminal.interactive && !options.dryRun) {
    const question = agentQuestion(found.length > 0, lang);
    const chosen = await terminal.chooseMany(question, agentChoices(found, lang, offered), found);
    const tools = chosen ?? found;
    return { tools: tools.length > 0 ? tools : ["claude-code"], warnings: [] };
  }
  if (found.length > 0) return { tools: found, warnings: [] };
  return { tools: ["claude-code"], warnings: [noAgentWarning(COMMAND, lang, offered)] };
}

/**
 * Installs layers 2 and 3 of ARCHITECTURE §10: the guard in each agent tool of `tools`, as its
 * module says (`agents/`), and git's hooks through the repository's hook manager. Says what it
 * installed and what is left to the person, such as a hook manager's configuration or a command
 * that is not on PATH.
 */
export async function installHooks(options: {
  readonly environment: Environment;
  readonly root: string;
  readonly git: Git;
  readonly tools: readonly AgentTool[];
  readonly lang: Lang;
  readonly files: InstallFiles;
  /** The configuration each agent installs with; Specty's defaults when not given. */
  readonly config?: ResolvedConfig;
}): Promise<HooksInstall> {
  const { environment, root, git, tools, lang, files } = options;
  const config = options.config ?? DEFAULT_CONFIG;
  const { invocation } = environment;
  const done: string[] = [];
  const warnings: string[] = [];
  const written: string[] = [];
  // Claude Code reads CLAUDE.md, which imports AGENTS.md instead of copying it.
  if (tools.includes("claude-code")) {
    if (await writeClaudePointer(root, files)) done.push(claudePointerLine(lang));
    written.push("CLAUDE.md");
  }
  for (const agent of Object.values(ADAPTERS)) {
    if (!tools.includes(agent.tool)) continue;
    const installed = await agent.install({
      root,
      git,
      invocation,
      files,
      lang,
      env: environment.env,
      config,
    });
    done.push(...installed.done);
    warnings.push(...installed.warnings);
    written.push(...installed.written);
  }
  const unsupported = tools
    .filter((tool) => !isGuardedAgent(tool))
    .map((tool) => AGENT_NAMES[tool]);
  if (unsupported.length > 0) warnings.push(noHooksWarning(unsupported, lang));
  const hooks = await installGitHooks(root, git, invocation, files);
  // Hooks inside the git directory are not in the tree; husky's and lefthook's files are.
  written.push(
    ...hooks.files.map((file) => relative(root, resolve(root, file)).split(sep).join("/")),
  );
  if (hooks.manual === undefined) done.push(gitHooksLine(hooks.manager, lang));
  else warnings.push(gitHooksManualWarning(hooks.manager, hooks.manual, lang));
  if (!invocation.portable) warnings.push(notOnPathWarning(COMMAND, lang));
  return { done, warnings, written };
}

/**
 * The end of turn of each agent of `tools` that has one, next to the guard `installHooks` wrote
 * and with its command (ADR 0012): it sends the agent back to `specty wait` while the change
 * waits for the person, with `--no-check`, since only `check --install` turns on `specty check
 * --changed` in it. One that is already there stays as it is, with its check if it had it.
 */
export async function installAgentStops(options: {
  readonly root: string;
  readonly files: InstallFiles;
  readonly tools: readonly AgentTool[];
  /** `verify.timeoutSec`: the time the check gets once `check --install` turns it on. */
  readonly timeout: number;
}): Promise<void> {
  const { root, files, tools, timeout } = options;
  for (const { tool, stop } of Object.values(ADAPTERS)) {
    if (tools.includes(tool)) await stop?.plan({ root, files, timeout, tool, check: false });
  }
}
