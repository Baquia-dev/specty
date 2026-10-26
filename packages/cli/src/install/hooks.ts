// SPDX-License-Identifier: Apache-2.0
import { relative, resolve, sep } from "node:path";
import {
  AGENT_NAMES,
  type AgentTool,
  claudePointerLine,
  codexGuardLine,
  codexTrustWarning,
  gitHooksLine,
  gitHooksManualWarning,
  guardLine,
  isGuardedAgent,
  type Lang,
  noHooksWarning,
  notOnPathWarning,
  opencodeGuardLine,
} from "@baquia-dev/specty-core";
import type { Git } from "../io/git";
import { COMMAND, type Environment } from "../session";
import { installClaudeCode, installCodex, installCursor } from "./agents";
import type { InstallFiles } from "./files";
import { installGitHooks } from "./git-hooks";
import { installOpencode } from "./opencode";
import { writeClaudePointer } from "./project-files";

interface HooksInstall {
  /** What was installed, for init's output. */
  readonly done: readonly string[];
  readonly warnings: readonly string[];
  /** Repository-relative files written that git tracks: they go into init's commit. */
  readonly written: readonly string[];
}

/**
 * Installs layers 2 and 3 of ARCHITECTURE §10: the guard in each agent tool of `tools`, and git's
 * hooks through the repository's hook manager. Says what it installed and what is left to the
 * person, such as a hook manager's configuration or a command that is not on PATH.
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
  const done: string[] = [];
  const warnings: string[] = [];
  const written: string[] = [];
  if (tools.includes("claude-code")) {
    if (await writeClaudePointer(root, files)) done.push(claudePointerLine(lang));
    const installed = await installClaudeCode(root, git, environment.invocation, files);
    written.push("CLAUDE.md", ...(installed.local ? [] : [installed.file]));
    done.push(guardLine("Claude Code", installed.file, installed.local, lang));
  }
  if (tools.includes("cursor")) {
    const installed = await installCursor(root, git, environment.invocation, files);
    if (!installed.local) written.push(installed.file);
    done.push(guardLine("Cursor", installed.file, installed.local, lang));
  }
  if (tools.includes("codex")) {
    const installed = await installCodex(root, git, environment.invocation, files);
    if (!installed.local) written.push(installed.file);
    done.push(codexGuardLine(installed.file, installed.local, lang));
    warnings.push(codexTrustWarning(lang));
  }
  if (tools.includes("opencode")) {
    const installed = await installOpencode(root, git, environment.invocation, files);
    if (!installed.local) written.push(installed.file);
    done.push(opencodeGuardLine(installed.file, installed.local, lang));
  }
  const unsupported = tools
    .filter((tool) => !isGuardedAgent(tool))
    .map((tool) => AGENT_NAMES[tool]);
  if (unsupported.length > 0) warnings.push(noHooksWarning(unsupported, lang));
  const hooks = await installGitHooks(root, git, environment.invocation, files);
  // Hooks inside the git directory are not in the tree; husky's and lefthook's files are.
  written.push(
    ...hooks.files.map((file) => relative(root, resolve(root, file)).split(sep).join("/")),
  );
  if (hooks.manual === undefined) done.push(gitHooksLine(hooks.manager, lang));
  else warnings.push(gitHooksManualWarning(hooks.manager, hooks.manual, lang));
  if (!environment.invocation.portable) warnings.push(notOnPathWarning(COMMAND, lang));
  return { done, warnings, written };
}
