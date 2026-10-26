// SPDX-License-Identifier: Apache-2.0
import { relative, resolve, sep } from "node:path";
import {
  AGENT_NAMES,
  type AgentTool,
  isGuardedAgent,
  type Lang,
  translator,
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
  const { environment, root, git, tools, files } = options;
  const t = translator(options.lang);
  const done: string[] = [];
  const warnings: string[] = [];
  const written: string[] = [];
  if (tools.includes("claude-code")) {
    if (await writeClaudePointer(root, files))
      done.push(t("CLAUDE.md importa AGENTS.md.", "CLAUDE.md imports AGENTS.md."));
    const installed = await installClaudeCode(root, git, environment.invocation, files);
    written.push("CLAUDE.md", ...(installed.local ? [] : [installed.file]));
    done.push(
      t(
        `Claude Code: guard en ${installed.file}${installed.local ? " (local)" : ""}.`,
        `Claude Code: guard in ${installed.file}${installed.local ? " (local)" : ""}.`,
      ),
    );
  }
  if (tools.includes("cursor")) {
    const installed = await installCursor(root, git, environment.invocation, files);
    if (!installed.local) written.push(installed.file);
    done.push(
      t(
        `Cursor: guard en ${installed.file}${installed.local ? " (local)" : ""}.`,
        `Cursor: guard in ${installed.file}${installed.local ? " (local)" : ""}.`,
      ),
    );
  }
  if (tools.includes("codex")) {
    // Outside the repository: nothing for init's commit.
    const file = await installCodex(environment.env, environment.invocation, files);
    done.push(
      t(
        `Codex: guard en ${file}, tu configuración de usuario: vale para todos tus repositorios y fuera de los que usan Specty no hace nada.`,
        `Codex: guard in ${file}, your user configuration: it applies to all your repositories and does nothing outside those using Specty.`,
      ),
    );
    warnings.push(
      t(
        "Codex solo ejecuta el guard cuando confías en él: en Codex, abre `/hooks` y márcalo como de confianza. Basta una vez.",
        "Codex runs the guard only once you trust it: in Codex, open `/hooks` and trust it. Once is enough.",
      ),
    );
  }
  if (tools.includes("opencode")) {
    const file = await installOpencode(environment.env, environment.invocation, files);
    done.push(
      t(
        `OpenCode: plugin del guard en ${file}, tu configuración global: vale para todos tus repositorios y fuera de los que usan Specty no hace nada.`,
        `OpenCode: guard plugin in ${file}, your global configuration: it applies to all your repositories and does nothing outside those using Specty.`,
      ),
    );
  }
  const unsupported = tools
    .filter((tool) => !isGuardedAgent(tool))
    .map((tool) => AGENT_NAMES[tool]);
  if (unsupported.length > 0) {
    warnings.push(
      t(
        `Sin hooks todavía para: ${unsupported.join(", ")}. Los protegen los hooks de git y el CI.`,
        `No hooks yet for: ${unsupported.join(", ")}. Git hooks and CI still protect them.`,
      ),
    );
  }
  const hooks = await installGitHooks(root, git, environment.invocation, files);
  // Hooks inside the git directory are not in the tree; husky's and lefthook's files are.
  written.push(
    ...hooks.files.map((file) => relative(root, resolve(root, file)).split(sep).join("/")),
  );
  if (hooks.manual === undefined) {
    done.push(
      t(
        `Git: hooks pre-commit y prepare-commit-msg (${hooks.manager}).`,
        `Git: pre-commit and prepare-commit-msg hooks (${hooks.manager}).`,
      ),
    );
  } else {
    warnings.push(
      t(
        `Añade a la configuración de ${hooks.manager}: ${hooks.manual}`,
        `Add to the ${hooks.manager} configuration: ${hooks.manual}`,
      ),
    );
  }
  if (!environment.invocation.portable) {
    warnings.push(
      t(
        `\`${COMMAND}\` no está en el PATH: los hooks usan la ruta de este script. Instálalo con \`npm i -g @baquia-dev/specty\` para que funcionen en cualquier máquina.`,
        `\`${COMMAND}\` is not on PATH: hooks use this script's path. Install it with \`npm i -g @baquia-dev/specty\` so they work on any machine.`,
      ),
    );
  }
  return { done, warnings, written };
}
