// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, sep } from "node:path";
import {
  AGENT_NAMES,
  backupLine,
  claudePointerStaysLine,
  globalGuardStaysLine,
  historyStaysLine,
  nothingRemovedCard,
  nothingToRemoveCard,
  notInteractiveCard,
  type Output,
  removalChoices,
  removalLine,
  removalNoteTitle,
  removalPlanCard,
  removalQuestion,
  removedCard,
  unwatchedChangeWarning,
} from "@baquia-dev/specty-core";
import type { Command } from "commander";
import { ADAPTERS, removeAgentHooks } from "../agents";
import { isFinished, resolveActive } from "../flow/active";
import { hasGuard } from "../install/agents";
import { type FileChange, type InstallFiles, installFiles } from "../install/files";
import { removeGitHooks } from "../install/git-hooks";
import { removeAgentsBlocks } from "../install/project-files";
import { exists, readText } from "../io/files";
import type { Session } from "../session";

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
async function uninstall(session: Session, dryRun: boolean): Promise<Output> {
  const { cards, lang } = session;
  const { terminal } = session.environment;
  if (!dryRun && !terminal.interactive) return notInteractiveCard("uninstall", cards);
  const plan = installFiles({ dryRun: true });
  await removeSpecty(session, plan);
  const lines = plan.changes.map((change) => described(change, session));
  if (lines.length === 0) return nothingToRemoveCard(cards);
  if (dryRun) return removalPlanCard(lines, cards);
  const warning = await activeWarning(session);
  terminal.note(removalNoteTitle(lang), [...lines, ...warning].join("\n"));
  // The first option is the default one: removing it takes an explicit choice.
  const answer = await terminal.choose(removalQuestion(lang), removalChoices(lang));
  if (answer !== "yes") return nothingRemovedCard(cards);
  const stamp = session.environment
    .now()
    .toISOString()
    .replace(/\.\d+Z$/, "Z");
  const backups = await session.git.gitPath(`common/specty/backups/${stamp.replaceAll(":", "-")}`);
  const files = installFiles({ backups: { folder: backups, root: session.root } });
  await removeSpecty(session, files);
  const stays = await remaining(session);
  if (await exists(backups)) stays.unshift(backupLine(backups, lang));
  return removedCard(
    files.changes.map((change) => described(change, session)),
    [...stays, ...warning],
    cards,
  );
}

/** Everything `init` installed in the repository, taken out through `files`. */
async function removeSpecty(session: Session, files: InstallFiles): Promise<void> {
  await removeAgentsBlocks(session.root, files);
  await removeAgentHooks(session.root, files, session.git);
  await removeGitHooks(session.root, session.git, files);
}

function described(change: FileChange, session: Session): string {
  const inner = relative(session.root, change.path);
  const path =
    inner.startsWith("..") || isAbsolute(inner) ? change.path : inner.split(sep).join("/");
  return removalLine(path, change.removed === true, session.lang);
}

/** What `uninstall` leaves on purpose, so the person knows where it is. */
async function remaining(session: Session): Promise<string[]> {
  const env = session.environment.env;
  const stays = [historyStaysLine(session.lang)];
  for (const { tool, userFile } of Object.values(ADAPTERS)) {
    const file = userFile?.(env);
    if (file === undefined || !hasGuard(await readText(file), tool)) continue;
    stays.push(globalGuardStaysLine(AGENT_NAMES[tool], file, session.lang));
  }
  if (await exists(join(session.root, "CLAUDE.md"))) {
    stays.push(claudePointerStaysLine(session.lang));
  }
  return stays;
}

async function activeWarning(session: Session): Promise<string[]> {
  const active = await resolveActive(session);
  if (active === undefined || isFinished(active.state)) return [];
  return [unwatchedChangeWarning(active.state.id, session.lang)];
}
