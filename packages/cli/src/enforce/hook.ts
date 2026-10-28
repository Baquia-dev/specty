// SPDX-License-Identifier: Apache-2.0
import { blockedCommitMessage, checkStagedFailedLine, matchesAny } from "@baquia-dev/specty-core";
import { check } from "../commands/check";
import { isFinished, resolveActive } from "../flow/active";
import { changeScope, stagedGoverned } from "../flow/retro-into";
import { COMMAND, type Session } from "../session";
import type { StoredChange } from "../store/changes";
import { takeMarker, takeReceipt, writeMarker } from "../store/local";

/**
 * `specty hook pre-commit` (ARCHITECTURE §9): lets through operations in progress, Specty's
 * own commits (receipts), ungoverned changes and manual edits inside the active change's
 * scope; blocks everything else until it is documented with a retro.
 */
export async function preCommit(session: Session): Promise<number> {
  const { git } = session;
  if (await git.operationInProgress()) return 0;
  const tree = await git.writeTree();
  const receipt = await takeReceipt(git, tree, session.environment.now());
  if (receipt !== undefined) {
    await writeMarker(git, { tree, change: receipt.change, kind: receipt.kind });
    return 0;
  }
  const governed = await stagedGoverned(session);
  if (governed.length === 0) return 0;
  const active = await resolveActive(session);
  const open = active !== undefined && !isFinished(active.state) ? active : undefined;
  if (open !== undefined && open.state.phase !== "draft") {
    return manualEdit(session, open, governed, tree);
  }
  session.environment.io.err(message(session, governed));
  return 1;
}

/**
 * A manual edit of the open change: inside its scope it passes, after `specty check --staged`
 * with `checks.preCommit`; outside it, it is blocked.
 */
async function manualEdit(
  session: Session,
  open: StoredChange,
  governed: readonly string[],
  tree: string,
): Promise<number> {
  const scope = await changeScope(session, open);
  const outside = governed.filter((path) => !matchesAny(path, scope));
  if (outside.length === 0) {
    if (session.config.checks.preCommit && !(await passesChecks(session))) return 1;
    await writeMarker(session.git, { tree, change: open.state.id, kind: "manual" });
    return 0;
  }
  session.environment.io.err(message(session, outside, open));
  return 1;
}

/** `specty check --staged` on a manual change, with `checks.preCommit`; its report goes to stderr. */
async function passesChecks(session: Session): Promise<boolean> {
  const result = await check(session, "staged", false);
  if (result.code === 0) return true;
  session.environment.io.err(`${checkStagedFailedLine(session.lang)}\n${result.report}`);
  return false;
}

/**
 * `specty hook prepare-commit-msg <file> [source]`: adds `Specty-Change` and, for manual
 * edits and retros, `Specty-Manual` or `Specty-Retro` trailers to the message.
 */
export async function prepareCommitMsg(
  session: Session,
  file: string,
  source: string | undefined,
): Promise<number> {
  const { git } = session;
  const marker = await takeMarker(git);
  if (marker === undefined || source === "merge" || source === "squash" || source === "commit")
    return 0;
  // Specty's installation belongs to no change: its message already says `Specty-Init`.
  if (marker.kind === "init") return 0;
  if (marker.tree !== (await git.writeTree())) return 0;
  const extra =
    marker.kind === "manual"
      ? ["Specty-Manual: true"]
      : marker.kind === "retro"
        ? ["Specty-Retro: true"]
        : [];
  const trailers = [`Specty-Change: ${marker.change}`, ...extra].flatMap((trailer) => [
    "--trailer",
    trailer,
  ]);
  await git.output([
    "interpret-trailers",
    "--in-place",
    "--if-exists",
    "doNothing",
    ...trailers,
    file,
  ]);
  return 0;
}

/**
 * The message of a blocked commit. Outside the scope of a change implementing a task, it offers
 * `retro --into`, which documents the paths in that change.
 */
function message(session: Session, paths: readonly string[], change?: StoredChange): string {
  const into =
    change?.state.phase === "implementing" &&
    Object.values(change.state.tasks).some((task) => task.status === "active");
  return blockedCommitMessage(
    {
      paths,
      ...(change !== undefined ? { change: change.state.id, into } : {}),
      minimalAllowed: session.config.retro.mode === "minimal",
      command: COMMAND,
    },
    session.lang,
  );
}
