// SPDX-License-Identifier: Apache-2.0

import { join } from "node:path";
import { type ChangeState, parseChangeState, parseSpec } from "@baquia-dev/specty-core";
import { exists, parseJson } from "../io/files";
import { GitError, resolved } from "../io/git";
import type { Session } from "../session";
import { isFinished } from "./active";
import { markedChanges } from "./branches";
import {
  addWorktree,
  type CopiedFiles,
  type Prepared,
  prepareWorktree,
  worktreesHome,
} from "./worktree";

/** An open change whose folder is gone, as its branch tells it (ARCHITECTURE §9). */
export interface LostChange {
  readonly id: string;
  readonly branch: string;
  readonly state: ChangeState;
  readonly title: string;
  /** Its `spec.md` at the tip of its branch, when there is one. */
  readonly spec?: string;
  /** The folders git still lists for its branch, which no longer exist. */
  readonly stale: readonly string[];
}

/** Where a change keeps its files in its branch. */
const changeFile = (id: string, file: string) => `.specty/changes/${id}/${file}`;

/**
 * The open changes without a folder: each branch `specty new` marked that no worktree with an
 * existing folder has checked out, and whose state at its tip is neither done nor cancelled. A
 * closed or cancelled change has no state there, since it was archived; one git process tells
 * which branches still have it, and only those are read.
 */
export async function lostChanges(session: Session): Promise<LostChange[]> {
  const { live, stale } = await checkedOut(session);
  const marked = (await markedChanges(session.git)).filter(({ branch }) => !live.has(branch));
  const present = await withState(session, marked);
  const read = await Promise.all(
    present.map((change) => readLost(session, change, stale.get(change.branch) ?? [])),
  );
  return read.flatMap((lost) => (lost === undefined ? [] : [lost]));
}

/** The branches checked out in a folder that exists, and the missing folders git lists for each. */
async function checkedOut(session: Session): Promise<{
  readonly live: ReadonlySet<string>;
  readonly stale: ReadonlyMap<string, readonly string[]>;
}> {
  const live = new Set<string>();
  const stale = new Map<string, string[]>();
  for (const { folder, branch } of await session.git.worktrees()) {
    if (branch === undefined) continue;
    if (await exists(folder)) live.add(branch);
    else stale.set(branch, [...(stale.get(branch) ?? []), folder]);
  }
  return { live, stale };
}

/** The marked branches whose tip has the change's `state.json`, asked to git all at once. */
async function withState<T extends { readonly branch: string; readonly id: string }>(
  session: Session,
  marked: readonly T[],
): Promise<T[]> {
  if (marked.length === 0) return [];
  const input = marked
    .map(({ branch, id }) => `refs/heads/${branch}:${changeFile(id, "state.json")}\n`)
    .join("");
  const result = await session.git.run(["cat-file", "--batch-check"], { input });
  if (result.code !== 0) return [];
  // One line per object asked, in order: `<oid> <type> <size>`, or `<object> missing`.
  const lines = result.stdout.split("\n");
  return marked.filter((_, index) => / blob \d+$/.test(lines[index] ?? ""));
}

/** The change of `branch` if its state at the tip is open, with the title of its spec. */
async function readLost(
  session: Session,
  { branch, id }: { readonly branch: string; readonly id: string },
  stale: readonly string[],
): Promise<LostChange | undefined> {
  const show = async (file: string) => {
    const shown = await session.git.run(["show", `refs/heads/${branch}:${changeFile(id, file)}`]);
    return shown.code === 0 ? shown.stdout : undefined;
  };
  const parsed = parseChangeState(parseJson((await show("state.json")) ?? ""));
  if (!parsed.ok || isFinished(parsed.state)) return undefined;
  const spec = await show("spec.md");
  const title =
    spec === undefined ? id : parseSpec(spec, { language: session.lang }).spec.title || id;
  return { id, branch, state: parsed.state, title, ...(spec !== undefined ? { spec } : {}), stale };
}

/** What `specty restore` did with a lost change's folder. */
export type RestoreOutcome =
  | {
      readonly kind: "restored";
      readonly folder: string;
      readonly copied: CopiedFiles;
      readonly prepared?: Prepared;
    }
  /** Git recognized again the folder in the change's place: it stays as it was. */
  | { readonly kind: "repaired"; readonly folder: string }
  /** A folder git does not recognize as the change's is in its place: untouched. */
  | { readonly kind: "in-the-way"; readonly folder: string }
  | { readonly kind: "git"; readonly detail: string };

/**
 * Brings back the folder of `lost` in `.worktrees/<id>`, where `specty new` puts them. A folder
 * already there gets `git worktree repair` and is used if git then recognizes it, and is left
 * untouched if not. Otherwise git forgets only the missing folders it listed for the branch, and
 * the branch is checked out as it is, with the agent's hooks copied, and prepared.
 */
export async function restoreFolder(session: Session, lost: LostChange): Promise<RestoreOutcome> {
  const { git } = session;
  const folder = join(await worktreesHome(git), lost.id);
  if (await exists(folder)) {
    await git.run(["worktree", "repair", folder]);
    return (await checksOut(session, folder, lost.branch))
      ? { kind: "repaired", folder }
      : { kind: "in-the-way", folder };
  }
  for (const missing of lost.stale) await git.run(["worktree", "remove", missing]);
  try {
    const copied = await addWorktree(git, { folder, branch: lost.branch });
    const prepared = await prepareWorktree(session, folder);
    return { kind: "restored", folder, copied, ...(prepared !== undefined ? { prepared } : {}) };
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    return { kind: "git", detail: error.message };
  }
}

/** Whether git lists `folder` as a worktree with `branch` checked out. */
async function checksOut(session: Session, folder: string, branch: string): Promise<boolean> {
  const own = await resolved(folder);
  for (const worktree of await session.git.worktrees()) {
    if (worktree.branch === branch && (await resolved(worktree.folder)) === own) return true;
  }
  return false;
}
