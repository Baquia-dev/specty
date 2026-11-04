// SPDX-License-Identifier: Apache-2.0
import { type ChangeState, parseChangeState, parseSpec } from "@baquia-dev/specty-core";
import { exists, parseJson } from "../io/files";
import type { Session } from "../session";
import { isFinished } from "./active";
import { markedChanges } from "./branches";

/** An open change whose folder is gone, as its branch tells it (ARCHITECTURE §9). */
export interface LostChange {
  readonly id: string;
  readonly branch: string;
  readonly state: ChangeState;
  readonly title: string;
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
  return { id, branch, state: parsed.state, title, stale };
}
