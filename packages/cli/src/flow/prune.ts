// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import {
  cancelledFolderStaysLine,
  cancelledWorkSavedLine,
  cancelWorkCommitSubject,
  type Lang,
  notInTargetBranchLine,
  notInTargetFolderLine,
  type RescuedFolder,
  type UnsavedFolder,
  workingFolderLine,
} from "@baquia-dev/specty-core";
import { exists } from "../io/files";
import { resolved } from "../io/git";
import type { Session } from "../session";
import { removeActivity } from "../store/activity";
import type { StoredChange } from "../store/changes";
import { readBindings } from "../store/local";
import { dropMessages, messageChanges } from "../store/messages";
import { isFinished } from "./active";
import { markedBranches } from "./branches";
import { locateChanges } from "./changes";
import { commitWithReceipt, decisionTrailers } from "./commits";
import { integrationOf, isIncorporated, reasonOf } from "./integrate";
import { type FolderLeft, leaveChangeFolder, within } from "./land";
import { type Rescue, rescueFolder } from "./rescue";
import { targetBranch } from "./worktree";

export interface Cleanup {
  readonly removed: readonly string[];
  /** What stays, each with why. */
  readonly kept: readonly string[];
}

/** What a clean-up of folders did: also what it saved in rescue refs, and what it could not. */
export interface FolderCleanup extends Cleanup {
  readonly rescued: readonly RescuedFolder[];
  readonly unsaved: readonly UnsavedFolder[];
}

/** A `FolderCleanup` that fills as it goes. */
interface Tally {
  readonly removed: string[];
  readonly kept: string[];
  readonly rescued: RescuedFolder[];
  readonly unsaved: UnsavedFolder[];
}

const tally = (): Tally => ({ removed: [], kept: [], rescued: [], unsaved: [] });

/** No rescue: a folder with nothing to save. */
const NOTHING: Rescue = { kind: "nothing" };

/**
 * A session's record stops counting a day after it was made, or once its tool said the
 * conversation ended (`ended`): nothing deletes it at the end.
 */
const SESSION_DAY = 24 * 60 * 60 * 1000;

/**
 * Removes the worktrees of finished changes that no longer need one: closed and already in their
 * target branch (or not meant to be incorporated), or cancelled, also with something uncommitted,
 * which first goes to a rescue ref. Never the folder this process runs in, nor one an agent
 * session works in (as the guard recorded it), nor the main folder. The branches stay.
 */
export async function removeFinished(session: Session): Promise<FolderCleanup> {
  const { lang } = session;
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const working = await workingFolders(session);
  const done = tally();
  for (const { change, session: there } of await locateChanges(session)) {
    const { state } = change;
    if (!isFinished(state) || there.root === main) continue;
    if (await within(session.environment.cwd, there.root)) continue;
    const reason = await keptBecause(there, state, working, lang);
    if (reason === undefined) await removeWorktree(session, main, there, done);
    else done.kept.push(reason);
  }
  return done;
}

/**
 * Removes the finished change's worktree `there` from the main folder. What it has uncommitted
 * (tracked files that differ, or untracked ones git does not ignore) first goes to a rescue ref on
 * top of its HEAD, and then `--force` takes it with what git ignores; with nothing uncommitted,
 * `git worktree remove` goes without it, as a locked worktree still stays.
 */
async function removeWorktree(
  session: Session,
  main: string,
  there: Session,
  done: Tally,
): Promise<void> {
  const status = await there.git.run(["status", "--porcelain"]);
  const dirty = status.code === 0 && status.stdout.trim().length > 0;
  const parent = dirty ? await there.git.head() : undefined;
  const folder = there.root;
  await rescueThenRemove(session, { folder, save: dirty, parent }, done, async (force) => {
    const args = ["-C", main, "worktree", "remove", ...(force ? ["--force"] : []), folder];
    const result = await session.git.run(args);
    return result.code === 0 ? undefined : reasonOf(result);
  });
}

/**
 * Saves what `folder` has in a rescue ref, when `save`, on top of `parent` if there is one, and
 * then removes the folder with `remove` (with `--force` once something was saved), which gives why
 * it could not. A folder that could not be saved stays with what it has. If the folder stays after
 * all, its new ref goes again: each clean-up would leave one more.
 */
async function rescueThenRemove(
  session: Session,
  target: { readonly folder: string; readonly save: boolean; readonly parent: string | undefined },
  done: Tally,
  remove: (force: boolean) => Promise<string | undefined>,
): Promise<void> {
  const { folder } = target;
  const saved = target.save ? await rescueFolder(session, folder, target.parent) : NOTHING;
  if (saved.kind === "failed") {
    done.unsaved.push({ folder, reason: saved.reason });
    return;
  }
  const failure = await remove(saved.kind === "saved");
  if (failure !== undefined) {
    if (saved.kind === "saved") await session.git.run(["update-ref", "-d", saved.ref]);
    done.kept.push(`${folder}: ${failure}`);
    return;
  }
  done.removed.push(folder);
  if (saved.kind === "saved") done.rescued.push({ folder, ref: saved.ref, bytes: saved.bytes });
}

/**
 * The folders agent sessions work in, as the guard recorded them in the last day, resolved; not
 * those of conversations their tool said ended.
 */
async function workingFolders(session: Session): Promise<string[]> {
  const now = session.environment.now().getTime();
  return Promise.all(
    (await readBindings(session.git))
      .filter(({ at, ended }) => ended === undefined && now - Date.parse(at) < SESSION_DAY)
      .map(({ folder }) => resolved(folder)),
  );
}

/** What became of the cancelled change's folder, and the line of the commit that kept its work. */
export interface CancelledFolder extends FolderLeft {
  readonly saved?: string;
}

/**
 * The folder of the change `session` has just cancelled goes at once, as the clean-up would take
 * it later. What it had uncommitted first goes into a commit of its branch, so that nothing is
 * lost; it stays only if an agent session works in it, or if git could not make that commit. As
 * with `close`, it goes from under whoever cancels from inside it: a person, or the agent in
 * delegated mode, which must then leave it. Never the main folder, and the branch stays. Returns
 * the card's lines (the commit, if any; removed, or why it stays) and how the agent inside leaves;
 * nothing when the change lives in the main folder.
 */
export async function removeCancelled(
  session: Session,
  change: { readonly id: string; readonly branch: string },
): Promise<CancelledFolder | undefined> {
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const folder = session.git.root;
  if ((await resolved(folder)) === (await resolved(main))) return undefined;
  const commit = await commitUncommitted(session, change.id);
  const reason = await cancelledKeptBecause(session, folder);
  const stays =
    reason === undefined ? undefined : cancelledFolderStaysLine(folder, reason, session.cards);
  const left = await leaveChangeFolder(session, { ...change, main }, stays);
  return commit === undefined
    ? left
    : { ...left, saved: cancelledWorkSavedLine(commit, change.branch, session.cards) };
}

/**
 * Commits on the cancelled change's branch what its folder has uncommitted (tracked files that
 * differ, and untracked ones git does not ignore), with Specty's receipt. Returns the short hash,
 * or nothing when there was nothing to commit or git refused: then the index is left as it was.
 */
async function commitUncommitted(session: Session, id: string): Promise<string | undefined> {
  const status = await session.git.run(["status", "--porcelain"]);
  if (status.code !== 0 || status.stdout.trim().length === 0) return undefined;
  try {
    return await commitWithReceipt(session, {
      subject: cancelWorkCommitSubject(id, session.lang),
      trailers: decisionTrailers(session, id),
      stage: [["."]],
      receipt: { change: id, kind: "close" },
    });
  } catch {
    await session.git.run(["reset", "-q"]);
    return undefined;
  }
}

/**
 * Why the cancelled change's folder stays: an agent session works in it, or it has uncommitted
 * changes (tracked files that differ, or untracked ones git does not ignore). The sessions bound to
 * it do not keep it from the agent that cancels from inside: its own is one of them, and not every
 * tool tells which conversation runs the command.
 */
async function cancelledKeptBecause(
  session: Session,
  folder: string,
): Promise<"working" | "uncommitted" | undefined> {
  const inside = session.actor === "agent" && (await within(session.environment.cwd, folder));
  if (!inside && (await workingFolders(session)).includes(await resolved(folder))) return "working";
  const status = await session.git.run(["status", "--porcelain"]);
  return status.code !== 0 || status.stdout.trim().length > 0 ? "uncommitted" : undefined;
}

/** Why a finished change's folder stays: an agent session works in it, or it is not in its target. */
async function keptBecause(
  there: Session,
  state: StoredChange["state"],
  working: readonly string[],
  lang: Lang,
): Promise<string | undefined> {
  // Such as the session that closed its change from inside, in delegated mode.
  if (working.includes(await resolved(there.root))) return workingFolderLine(there.root, lang);
  const plan = state.phase === "done" ? await integrationOf(there, state) : undefined;
  if (plan !== undefined && !(await isIncorporated(there, plan))) {
    return notInTargetFolderLine(there.root, state.id, plan.target, lang);
  }
  return undefined;
}

/**
 * Deletes the change branches (`specty/*`, `spike/*` and those `new` marked, whatever `git.flow`
 * named them) that are already in the target branch and checked out in no worktree: their
 * commits are in the target, so nothing is lost. The others stay, such as a cancelled change's,
 * which keeps its record. A branch Specty did not create never goes, even one named by the flow.
 */
export async function deleteMerged(session: Session): Promise<Cleanup> {
  const { git } = session;
  const target = await targetBranch(git, session.config.git.target);
  if (target === undefined) return { removed: [], kept: [] };
  const patterns = ["specty/*", "spike/*", ...(await markedBranches(git))];
  const branches = async (filter: "--merged" | "--no-merged") =>
    (
      await git.output([
        "branch",
        filter,
        target,
        "--format=%(refname:short)",
        "--list",
        ...patterns,
      ])
    )
      .split("\n")
      .map((branch) => branch.trim())
      .filter((branch) => branch.length > 0);
  const inUse = new Set((await git.worktrees()).flatMap(({ branch }) => branch ?? []));
  const removed: string[] = [];
  for (const branch of (await branches("--merged")).filter((name) => !inUse.has(name))) {
    if ((await git.run(["branch", "-D", branch])).code === 0) removed.push(branch);
  }
  const kept = (await branches("--no-merged")).map((branch) =>
    notInTargetBranchLine(branch, target, session.lang),
  );
  return { removed, kept };
}

/**
 * The memory's live half that no longer serves anybody (ADR 0016): the activity of the
 * conversations that no longer work, and the messages of the changes that are no longer open. A
 * record goes when its folder is gone, or when its last step is older than
 * `memory.orphanAfterMin` in a folder with no open change; `status` still reads the others.
 */
export async function pruneLive(
  session: Session,
): Promise<{ readonly activity: number; readonly messages: readonly string[] }> {
  const open = (await locateChanges(session)).filter(({ change }) => !isFinished(change.state));
  const ids = new Set(open.map(({ change }) => change.state.id));
  const folders = new Set(await Promise.all(open.map(({ session: there }) => real(there.root))));
  const now = session.environment.now().getTime();
  const limit = session.config.memory.orphanAfterMin * 60_000;
  const activity = await removeActivity(session.git, async (record) => {
    if (!(await exists(record.folder))) return true;
    return now - Date.parse(record.last) > limit && !folders.has(await real(record.folder));
  });
  const messages = (await messageChanges(session.git)).filter((id) => !ids.has(id));
  await Promise.all(messages.map((id) => dropMessages(session.git, id)));
  return { activity, messages };
}

/** The real path of `folder`, or `folder` itself when it no longer exists. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
