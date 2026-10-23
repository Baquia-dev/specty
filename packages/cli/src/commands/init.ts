// SPDX-License-Identifier: Apache-2.0
import { basename, relative, resolve, sep } from "node:path";
import {
  AGENT_NAMES,
  type AgentTool,
  blockedCard,
  headerOf,
  type Lang,
  type Output,
  section,
  translator,
} from "@baquia-dev/specty-core";
import { type Detection, detectProject, projectFacts, verifyCommands } from "../detect/project";
import { installClaudeCode, installCursor } from "../install/agents";
import { commitInstall } from "../install/commit";
import { installGitHooks } from "../install/git-hooks";
import { renderConfig, writeAgentsMd, writeClaudePointer } from "../install/project-files";
import { writeText } from "../io/files";
import { createGit, findRoot, pathsOf } from "../io/git";
import { COMMAND, type Environment, systemLanguage } from "../session";
import { loadConfig } from "../store/config";
import { repoPaths } from "../store/paths";

export interface InitOptions {
  readonly language?: Lang;
  /** Agent tools to configure; by default, the ones detected in the repository. */
  readonly tools?: readonly AgentTool[];
}

const WITH_HOOKS: ReadonlySet<AgentTool> = new Set(["claude-code", "cursor"]);

/** `specty init`: detects the project and installs config, AGENTS.md blocks and hooks. Idempotent. */
export async function init(environment: Environment, options: InitOptions): Promise<Output> {
  const fallback = options.language ?? systemLanguage(environment.env);
  const root = await findRoot(environment.cwd);
  const early = translator(fallback);
  if (root === undefined) {
    return blockedCard(
      headerOf("init"),
      early("Esto no es un repositorio git.", "This is not a git repository."),
      early("ejecuta `git init` y vuelve a intentarlo.", "run `git init` and try again."),
    );
  }
  const paths = repoPaths(root);
  const git = createGit(root, environment.env);
  // What already had changes stays out of init's commit: it is the person's work.
  const before = new Set(pathsOf(await git.changedSince(await git.head())));
  const existing = await loadConfig(paths);
  if (existing.kind === "invalid") {
    return blockedCard(
      headerOf("init"),
      early(
        `.specty/config.yaml no es válido: ${existing.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
        `.specty/config.yaml is invalid: ${existing.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
      ),
      early("corrígelo y vuelve a ejecutar `specty init`.", "fix it and run `specty init` again."),
    );
  }
  const lang = existing.kind === "ok" ? existing.config.language : fallback;
  const t = translator(lang);
  const detection = await detectProject(root, basename(root));
  if (existing.kind === "missing") await writeText(paths.config, renderConfig(lang, detection));

  const tools =
    options.tools ?? (detection.tools.length > 0 ? detection.tools : ["claude-code" as const]);
  const agents = await writeAgentsMd(root, lang, detection);
  // Repository-relative files init writes that git tracks: they go into its commit.
  const written = [".specty/config.yaml", "AGENTS.md"];
  const done: string[] = [
    existing.kind === "missing"
      ? t(".specty/config.yaml creado.", ".specty/config.yaml created.")
      : t(
          ".specty/config.yaml ya existía; no se tocó.",
          ".specty/config.yaml already existed; left untouched.",
        ),
    agents === "created"
      ? t("AGENTS.md creado con los bloques de Specty.", "AGENTS.md created with Specty's blocks.")
      : t("AGENTS.md: bloques de Specty actualizados.", "AGENTS.md: Specty's blocks updated."),
  ];
  const warnings: string[] = [];
  if (tools.includes("claude-code")) {
    if (await writeClaudePointer(root))
      done.push(t("CLAUDE.md importa AGENTS.md.", "CLAUDE.md imports AGENTS.md."));
    const installed = await installClaudeCode(root, git, environment.invocation);
    written.push("CLAUDE.md", ...(installed.local ? [] : [installed.file]));
    done.push(
      t(
        `Claude Code: guard en ${installed.file}${installed.local ? " (local)" : ""}.`,
        `Claude Code: guard in ${installed.file}${installed.local ? " (local)" : ""}.`,
      ),
    );
  }
  if (tools.includes("cursor")) {
    const installed = await installCursor(root, git, environment.invocation);
    if (!installed.local) written.push(installed.file);
    done.push(
      t(
        `Cursor: guard en ${installed.file}${installed.local ? " (local)" : ""}.`,
        `Cursor: guard in ${installed.file}${installed.local ? " (local)" : ""}.`,
      ),
    );
  }
  const unsupported = tools
    .filter((tool) => !WITH_HOOKS.has(tool))
    .map((tool) => AGENT_NAMES[tool]);
  if (unsupported.length > 0) {
    warnings.push(
      t(
        `Sin hooks todavía para: ${unsupported.join(", ")}. Los protegen los hooks de git y el CI.`,
        `No hooks yet for: ${unsupported.join(", ")}. Git hooks and CI still protect them.`,
      ),
    );
  }
  const hooks = await installGitHooks(root, git, environment.invocation);
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
  if (verifyCommands(detection.commands).default === undefined) {
    warnings.push(
      t(
        "No se detectó un comando de tests: define verify.default en .specty/config.yaml.",
        "No test command detected: set verify.default in .specty/config.yaml.",
      ),
    );
  }
  const committed = await commitInstall(environment, written, before, existing.kind === "missing");
  done.push(...committed.done);
  warnings.push(...committed.warnings);
  const facts = projectFacts(detection);
  return {
    status: "ok",
    header: headerOf("init"),
    blocks: [
      ...section(t("CONFIGURADO", "CONFIGURED"), done),
      ...section(t("DETECTADO", "DETECTED"), [
        ...facts.stacks,
        ...facts.commands.map((entry) => `${entry.label}: ${entry.command}`),
      ]),
      ...section(t("AVISOS", "WARNINGS"), warnings),
    ],
    next: t(
      `completa las secciones «Mapa» y «Convenciones» de AGENTS.md con lo que no se deduce del código, revisa .specty/config.yaml y ejecuta \`${COMMAND} doctor\`.`,
      `complete the "Map" and "Conventions" sections of AGENTS.md with what cannot be inferred from the code, review .specty/config.yaml and run \`${COMMAND} doctor\`.`,
    ),
  };
}

export type { Detection };
