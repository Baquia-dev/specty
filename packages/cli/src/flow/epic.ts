// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type Phase,
  parseSpec,
  type SliceView,
  type Spec,
  transition,
} from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";
import { listDir, loadState, readSpec, type StoredChange } from "../store/changes";
import { changeFiles, repoPaths } from "../store/paths";
import { commitState, isFinished } from "./active";
import { locateChanges } from "./changes";

/** A change that implements a slice of an epic. */
interface Child {
  readonly id: string;
  readonly slice: string;
  readonly phase: Phase;
  /** Where it is worked on, while it is open. */
  readonly folder?: string;
}

/**
 * The epic's slices, in the order of its spec, each with the change that implements it. The
 * slices are derived from those changes every time: the epic does not keep them in its state.
 */
export async function sliceViews(
  session: Session,
  epic: StoredChange,
  spec: Spec,
): Promise<SliceView[]> {
  // A cancelled change does not count: its slice can start again.
  const children = (await childrenOf(session, epic.state.id)).filter(
    (child) => child.phase !== "cancelled",
  );
  const closed = new Set(
    children.filter((child) => child.phase === "done").map((child) => child.slice),
  );
  return (spec.sections.slices?.items ?? []).map((slice): SliceView => {
    const own = children.filter((child) => child.slice === slice.id);
    const child = own.find((item) => item.phase === "done") ?? own[0];
    const status =
      child?.phase === "done"
        ? "done"
        : child !== undefined
          ? "open"
          : slice.depends.every((id) => closed.has(id))
            ? "ready"
            : "waiting";
    return {
      id: slice.id,
      title: slice.title,
      depends: slice.depends,
      status,
      ...(child === undefined
        ? {}
        : {
            child: {
              id: child.id,
              phase: child.phase,
              ...(child.folder === undefined ? {} : { folder: child.folder }),
            },
          }),
    };
  });
}

/** Moves an approved epic to acceptance once every slice has a closed change (`childrenDone`). */
export async function finishEpic(session: Session, epic: StoredChange): Promise<StoredChange> {
  const spec = parseSpec(await readSpec(epic.files), { language: session.lang }).spec;
  const slices = await sliceViews(session, epic, spec);
  if (slices.length === 0 || slices.some((slice) => slice.status !== "done")) return epic;
  const moved = transition({
    phase: epic.state.phase,
    kind: epic.state.kind,
    actor: "specty",
    event: { type: "childrenDone" },
  });
  if (!moved.ok) return epic;
  return commitState(
    session,
    epic,
    { ...epic.state, phase: moved.phase },
    "epic.slicesDone",
    { slices: Object.fromEntries(slices.map((slice) => [slice.id, slice.child?.id])) },
    "specty",
  );
}

/**
 * The changes whose spec names `epic`: the open one of each worktree, and the archived ones of
 * this folder and of the main one, where a closed change lands once it is incorporated.
 */
async function childrenOf(session: Session, epic: string): Promise<Child[]> {
  const children: Child[] = [];
  const seen = new Set<string>([epic]);
  for (const { change, session: there } of await locateChanges(session)) {
    const slice = await sliceOf(change.files.spec, epic);
    if (slice === undefined || seen.has(change.state.id)) continue;
    seen.add(change.state.id);
    const { id, phase } = change.state;
    children.push({
      id,
      slice,
      phase,
      ...(isFinished(change.state) ? {} : { folder: there.root }),
    });
  }
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  for (const archive of new Set([session.paths.archive, repoPaths(main).archive])) {
    for (const year of await listDir(archive)) {
      for (const id of await listDir(join(archive, year))) {
        if (seen.has(id)) continue;
        const files = changeFiles(join(archive, year, id));
        const slice = await sliceOf(files.spec, epic);
        if (slice === undefined) continue;
        seen.add(id);
        children.push({ id, slice, phase: (await loadState(files)).phase });
      }
    }
  }
  return children;
}

/** The slice a spec implements, when its frontmatter names `epic`. */
async function sliceOf(path: string, epic: string): Promise<string | undefined> {
  const text = await readText(path);
  // Most specs never name the epic: they are not parsed.
  if (text === undefined || !text.includes(epic)) return undefined;
  const { frontmatter } = parseSpec(text).spec;
  return frontmatter.epic === epic ? frontmatter.slice : undefined;
}
