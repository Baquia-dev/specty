// SPDX-License-Identifier: Apache-2.0
import {
  blockedCommitMessage,
  isGoverned,
  matchesAny,
  parseSpec,
  translator,
} from "@baquia-dev/specty-core";
import { check } from "../commands/check";
import { isFinished, resolveActive } from "../flow/active";
import { pathsOf } from "../io/git";
import { COMMAND, type Session } from "../session";
import { readSpec, type StoredChange } from "../store/changes";
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
  const governed = pathsOf(await git.staged()).filter(
    (path) => !path.startsWith(".specty/") && isGoverned(path, session.config),
  );
  if (governed.length === 0) return 0;
  const active = await resolveActive(session);
  const open = active !== undefined && !isFinished(active.state) ? active : undefined;
  if (open !== undefined && open.state.phase !== "draft") {
    const scope = await changeScope(session, open);
    const outside = governed.filter((path) => !matchesAny(path, scope));
    if (outside.length === 0) {
      if (session.config.checks.preCommit && !(await passesChecks(session))) return 1;
      await writeMarker(git, { tree, change: open.state.id, kind: "manual" });
      return 0;
    }
    session.environment.io.err(message(session, outside, open.state.id));
    return 1;
  }
  session.environment.io.err(message(session, governed, undefined));
  return 1;
}

/** `specty check --staged` on a manual change, with `checks.preCommit`; its report goes to stderr. */
async function passesChecks(session: Session): Promise<boolean> {
  const result = await check(session, "staged", false);
  if (result.code === 0) return true;
  const t = translator(session.lang);
  session.environment.io.err(
    `${t(
      "specty: el commit no pasa `specty check --staged`:",
      "specty: the commit does not pass `specty check --staged`:",
    )}\n${result.report}`,
  );
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

/** Every path the change declares or has been granted. */
async function changeScope(session: Session, change: StoredChange): Promise<string[]> {
  const spec = parseSpec(await readSpec(change.files), { language: session.lang }).spec;
  const declared = (spec.sections.files?.items ?? []).flatMap((entry) =>
    entry.from === undefined ? [entry.path] : [entry.path, entry.from],
  );
  const extras = Object.values(change.state.tasks).flatMap((task) => task.scopeExtra);
  return [...declared, ...extras];
}

function message(session: Session, paths: readonly string[], change: string | undefined): string {
  return blockedCommitMessage(
    {
      paths,
      ...(change !== undefined ? { change } : {}),
      minimalAllowed: session.config.retro.mode === "minimal",
      command: COMMAND,
    },
    session.lang,
  );
}
