// SPDX-License-Identifier: Apache-2.0
import { relative, resolve, sep } from "node:path";
import {
  AGENT_NAMES,
  type AgentTool,
  claudePointerLine,
  gitHooksLine,
  gitHooksManualWarning,
  isGuardedAgent,
  type Lang,
  noHooksWarning,
  notOnPathWarning,
} from "@baquia-dev/specty-core";
import { ADAPTERS } from "../agents";
import type { Git } from "../io/git";
import { COMMAND, type Environment } from "../session";
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
}): Promise<HooksInstall> {
  const { environment, root, git, tools, lang, files } = options;
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
    const installed = await agent.install({ root, git, invocation, files, lang });
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
