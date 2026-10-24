// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from "node:path";
import {
  headerOf,
  notInteractiveCard,
  type Output,
  section,
  translator,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { isFinished, resolveActive } from "../flow/active";
import { codexHooksFile, hasGuard, removeAgentHooks } from "../install/agents";
import { type FileChange, type InstallFiles, installFiles } from "../install/files";
import { removeGitHooks } from "../install/git-hooks";
import { opencodePluginFile } from "../install/opencode";
import { removeAgentsBlocks } from "../install/project-files";
import { exists, readText } from "../io/files";
import { COMMAND, type Session } from "../session";

type Translate = ReturnType<typeof translator>;

/** Registers `specty uninstall [--dry-run]`; `run` opens the session as for every command. */
export function uninstallCommand(
  program: Command,
  run: (handler: (session: Session) => Promise<Output>) => () => Promise<void>,
): void {
  program
    .command("uninstall")
    .description("remove what Specty installed in this repository (person only)")
    .option("--dry-run", "only list what it would remove")
    .action((options: { dryRun?: boolean }) =>
      run((session) => uninstall(session, options.dryRun === true))(),
    );
}

/**
 * `specty uninstall`: takes out of the repository what `init` installed, by the marks it left,
 * and keeps the rest of each file, the history in `.specty/` and the global guards. Only a person
 * at a real terminal runs it, after seeing the list; `--dry-run` only shows it. No commit.
 */
export async function uninstall(session: Session, dryRun: boolean): Promise<Output> {
  const t = translator(session.lang);
  const { terminal } = session.environment;
  if (!dryRun && !terminal.interactive) return notInteractiveCard("uninstall", session.cards);
  const plan = installFiles({ dryRun: true });
  await removeSpecty(session, plan);
  const lines = plan.changes.map((change) => described(change, session.root, t));
  const done = (blocks: Output["blocks"], next: string): Output => ({
    status: "ok",
    header: headerOf("uninstall"),
    blocks,
    next,
  });
  if (lines.length === 0) {
    return done(
      section(undefined, [
        t(
          "No hay nada de Specty que quitar en este repositorio.",
          "There is nothing of Specty to remove in this repository.",
        ),
      ]),
      t("nada que hacer.", "nothing to do."),
    );
  }
  if (dryRun) {
    return done(
      section(t("SE QUITARÍA", "WOULD REMOVE"), lines),
      t(
        `para quitarlo, ejecuta \`${COMMAND} uninstall\` en tu terminal.`,
        `to remove it, run \`${COMMAND} uninstall\` in your terminal.`,
      ),
    );
  }
  const warning = await activeWarning(session, t);
  terminal.note(t("Quitar Specty", "Remove Specty"), [...lines, ...warning].join("\n"));
  // The first option is the default one: removing it takes an explicit choice.
  const answer = await terminal.choose(
    t("¿Quitar Specty de este repositorio?", "Remove Specty from this repository?"),
    [
      { value: "no", label: t("No, lo dejo como está", "No, leave it as it is") },
      { value: "yes", label: t("Sí, quítalo", "Yes, remove it") },
    ],
  );
  if (answer !== "yes") {
    return done(
      section(undefined, [t("No se ha quitado nada.", "Nothing was removed.")]),
      t("nada que hacer.", "nothing to do."),
    );
  }
  const stamp = session.environment
    .now()
    .toISOString()
    .replace(/\.\d+Z$/, "Z");
  const backups = await session.git.gitPath(`common/specty/backups/${stamp.replaceAll(":", "-")}`);
  const files = installFiles({ backups: { folder: backups, root: session.root } });
  await removeSpecty(session, files);
  const stays = await remaining(session, t);
  if (await exists(backups)) {
    stays.unshift(
      t(`Copia de lo que había antes: ${backups}.`, `Copy of what was there before: ${backups}.`),
    );
  }
  return done(
    [
      ...section(
        t("QUITADO", "REMOVED"),
        files.changes.map((change) => described(change, session.root, t)),
      ),
      ...section(t("SE QUEDA", "STAYS"), [...stays, ...warning]),
    ],
    t(
      "revisa los cambios con `git status` y haz commit cuando quieras: ya no hay hooks que lo vigilen.",
      "review the changes with `git status` and commit them when you like: no hooks watch it any more.",
    ),
  );
}

/** Everything `init` installed in the repository, taken out through `files`. */
async function removeSpecty(session: Session, files: InstallFiles): Promise<void> {
  await removeAgentsBlocks(session.root, files);
  await removeAgentHooks(session.root, files);
  await removeGitHooks(session.root, session.git, files);
}

function described(change: FileChange, root: string, t: Translate): string {
  const inner = relative(root, change.path);
  const path =
    inner.startsWith("..") || isAbsolute(inner) ? change.path : inner.split(sep).join("/");
  return change.removed === true
    ? t(`borrar ${path}`, `delete ${path}`)
    : t(`quitar lo de Specty de ${path}`, `remove Specty's part of ${path}`);
}

/** What `uninstall` leaves on purpose, so the person knows where it is. */
async function remaining(session: Session, t: Translate): Promise<string[]> {
  const env = session.environment.env;
  const stays = [
    t(
      "`.specty/`: el historial de specs y auditoría; bórrala si no lo quieres.",
      "`.specty/`: the history of specs and audit; delete it if you do not want it.",
    ),
  ];
  const global = [
    { name: "Codex", file: codexHooksFile(env), tool: "codex" as const },
    { name: "OpenCode", file: opencodePluginFile(env), tool: "opencode" as const },
  ];
  for (const { name, file, tool } of global) {
    if (!hasGuard(await readText(file), tool)) continue;
    stays.push(
      t(
        `${name}: el guard sigue en ${file}, que sirve a todos tus repositorios y fuera de los que usan Specty no hace nada; quítalo de ahí si ya no usas Specty.`,
        `${name}: the guard stays in ${file}, which serves all your repositories and does nothing outside those using Specty; remove it there if you no longer use Specty.`,
      ),
    );
  }
  if (await exists(join(session.root, "CLAUDE.md"))) {
    stays.push(t("CLAUDE.md sigue importando AGENTS.md.", "CLAUDE.md still imports AGENTS.md."));
  }
  return stays;
}

async function activeWarning(session: Session, t: Translate): Promise<string[]> {
  const active = await resolveActive(session);
  if (active === undefined || isFinished(active.state)) return [];
  return [
    t(
      `Esta carpeta tiene un cambio en curso (${active.state.id}): sin Specty, nadie vigila sus tareas.`,
      `This folder has a change in progress (${active.state.id}): without Specty, nobody watches its tasks.`,
    ),
  ];
}
