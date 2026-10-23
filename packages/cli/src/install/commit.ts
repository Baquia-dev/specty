// SPDX-License-Identifier: Apache-2.0
import { translator } from "@baquia-dev/specty-core";
import { isFinished, resolveActive } from "../flow/active";
import { commitWithReceipt } from "../flow/commits";
import { pathsOf } from "../io/git";
import { COMMAND, type Environment, openSession } from "../session";

export interface InstallCommit {
  /** What was committed, for init's output. */
  readonly done: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Commits what `init` wrote (`written`, repository-relative), so the folder is clean afterwards:
 * only the files that now differ from HEAD and had no changes before `init` ran (`before`), with
 * a receipt for the git hooks. Nothing is committed while this folder has a change in progress:
 * the files would land on its branch, outside its tasks.
 */
export async function commitInstall(
  environment: Environment,
  written: readonly string[],
  before: ReadonlySet<string>,
  first: boolean,
): Promise<InstallCommit> {
  const opened = await openSession(environment);
  if (opened.kind !== "ok") return { done: [], warnings: [] };
  const { session } = opened;
  const t = translator(session.lang);
  const active = await resolveActive(session);
  if (active !== undefined && !isFinished(active.state)) {
    const id = active.state.id;
    return {
      done: [],
      warnings: [
        t(
          `Esta carpeta tiene un cambio activo (${id}): los archivos de Specty quedan sin commit. Ejecuta \`${COMMAND} init\` en la carpeta principal.`,
          `This folder has a change in progress (${id}): Specty's files stay uncommitted. Run \`${COMMAND} init\` in the main folder.`,
        ),
      ],
    };
  }
  const changed = new Set(pathsOf(await session.git.changedSince(await session.git.head())));
  const candidates = [...new Set(written)].filter((path) => changed.has(path)).toSorted();
  const mine = candidates.filter((path) => !before.has(path));
  const yours = candidates.filter((path) => before.has(path));
  const warnings =
    yours.length === 0
      ? []
      : [
          t(
            `Ya tenían cambios tuyos y quedan sin commit: ${yours.join(", ")}.`,
            `They already had your changes and stay uncommitted: ${yours.join(", ")}.`,
          ),
        ];
  if (mine.length === 0) return { done: [], warnings };
  const commit = await commitWithReceipt(session, {
    subject: first
      ? t("chore(specty): instalar Specty", "chore(specty): install Specty")
      : t(
          "chore(specty): actualizar la instalación de Specty",
          "chore(specty): update Specty's installation",
        ),
    trailers: { "Specty-Init": "true" },
    stage: [mine],
    only: mine,
    receipt: { change: "", kind: "init" },
  });
  const done = [
    t(`Commit ${commit}: ${mine.join(", ")}.`, `Commit ${commit}: ${mine.join(", ")}.`),
  ];
  return { done, warnings };
}
