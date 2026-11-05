// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  type Output,
  type Phase,
  parseSpec,
  type SliceRefusal,
  type SliceView,
  type Spec,
  sliceRefusalCard,
  transition,
} from "@baquia-dev/specty-core";
import { openChanges } from "../commands/status";
import { readText } from "../io/files";
import { resolved } from "../io/git";
import type { Session } from "../session";
import { listDir, loadState, readSpec, type StoredChange } from "../store/changes";
import { readBinding, writeBinding } from "../store/local";
import { changeFiles, repoPaths } from "../store/paths";
import { commitState, isFinished } from "./active";
import { locateChanges } from "./changes";
import { findChange } from "./find";

/** A change that implements a slice of an epic. */
interface Child {
  readonly id: string;
  readonly slice: string;
  readonly phase: Phase;
  /** Where it is worked on, while it is open. */
  readonly folder?: string;
}

/**
 * The epic's slices for its card: the change of a slice in progress that no conversation holds
 * (`status`'s orphan) says so, for the card to hand it to a subagent again (ARCHITECTURE §7).
 */
export async function epicSlices(
  session: Session,
  epic: StoredChange,
  spec: Spec,
): Promise<SliceView[]> {
  const slices = await sliceViews(session, epic, spec);
  if (!slices.some((slice) => slice.status === "open")) return slices;
  const orphans = new Set(
    (await openChanges(session)).flatMap((entry) => (entry.orphan === true ? [entry.id] : [])),
  );
  return slices.map((slice) =>
    slice.child !== undefined && orphans.has(slice.child.id)
      ? { ...slice, child: { ...slice.child, orphan: true } }
      : slice,
  );
}

/**
 * The epic's slices, in the order of its spec, each with the change that implements it. The
 * slices are derived from those changes every time: the epic does not keep them in its state.
 */
async function sliceViews(session: Session, epic: StoredChange, spec: Spec): Promise<SliceView[]> {
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

/** The change that implements a slice of an epic: the slice, and the change's id and phase. */
export interface SliceChange {
  readonly slice: string;
  readonly id: string;
  readonly phase: Phase;
}

/**
 * The change of each slice of the epic that has one, in the order of its spec, as its card picks
 * it: the closed one or, without one, the first of the others; a cancelled change does not count.
 */
export async function sliceChanges(
  session: Session,
  epic: StoredChange,
  spec: Spec,
): Promise<SliceChange[]> {
  return (await sliceViews(session, epic, spec)).flatMap(({ id, child }) =>
    child === undefined ? [] : [{ slice: id, id: child.id, phase: child.phase }],
  );
}

/**
 * The epic's slices whose change is closed, each with that change's id, for the validation of its
 * adjustments: they do not modify or remove them. A cancelled change does not close its slice.
 */
export async function closedSlices(
  session: Session,
  epic: string,
): Promise<ReadonlyMap<string, string>> {
  const children = await childrenOf(session, epic);
  return new Map(
    children.filter((child) => child.phase === "done").map((child) => [child.slice, child.id]),
  );
}

/**
 * Why `new --epic <epic> --slice <slice>` cannot start that slice, before anything is created:
 * the epic is not open and approved, the slice is not one of its slices, it already has a change,
 * or a slice it depends on is not closed. Undefined when it can start.
 */
export async function sliceRefusal(
  session: Session,
  epic: string | undefined,
  slice: string | undefined,
): Promise<Output | undefined> {
  if (epic === undefined && slice === undefined) return undefined;
  const { cards } = session;
  if (epic === undefined || slice === undefined) {
    return sliceRefusalCard({ reason: "incomplete" }, cards);
  }
  const found = (await locateChanges(session)).find(({ change }) => change.state.id === epic);
  if (found === undefined || found.change.state.kind !== "epic" || isFinished(found.change.state)) {
    return sliceRefusalCard({ reason: "no-epic", epic }, cards);
  }
  const { phase } = found.change.state;
  if (phase !== "implementing")
    return sliceRefusalCard({ reason: "not-approved", epic, phase }, cards);
  const spec = parseSpec(await readSpec(found.change.files), { language: session.lang }).spec;
  const slices = await sliceViews(found.session, found.change, spec);
  const refusal = pickedSliceRefusal(slices, epic, slice);
  return refusal === undefined ? undefined : sliceRefusalCard(refusal, cards);
}

/** The slice is not one of the epic's, already has a change, or depends on a slice not closed. */
function pickedSliceRefusal(
  slices: readonly SliceView[],
  epic: string,
  slice: string,
): SliceRefusal | undefined {
  const target = slices.find((item) => item.id === slice);
  if (target === undefined) {
    const ids = slices.map(({ id }) => id);
    return { reason: "no-slice", epic, slice, slices: ids };
  }
  if (target.child !== undefined) return { reason: "taken", slice, child: target.child };
  if (target.status === "waiting") {
    const closed = new Set(slices.filter((item) => item.status === "done").map(({ id }) => id));
    const waiting = target.depends.filter((id) => !closed.has(id));
    return { reason: "waiting", slice, waiting };
  }
  return undefined;
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

/** The open epic a conversation goes back to once it closes one of its slices. */
export interface EpicReturn {
  readonly id: string;
  /** Where the epic is worked on. */
  readonly folder: string;
  /** That folder is the main one. */
  readonly inMain: boolean;
}

/**
 * The epic the conversation that closes slice `id`, in `folder`, goes back to, bound again to the
 * epic's folder, as it was before it started the slice (ARCHITECTURE §10). Undefined, with nothing
 * touched, unless that conversation is bound to `folder` (a subagent's commands carry the id of
 * its session, bound to the epic), the change's spec names an epic, and that epic is still open.
 */
export async function returnToEpic(
  session: Session,
  id: string,
  folder: string,
): Promise<EpicReturn | undefined> {
  const conversation = await conversationIn(session, folder);
  const change = conversation === undefined ? undefined : await findChange(session, id);
  if (conversation === undefined || change === undefined) return undefined;
  const { epic } = parseSpec(await readSpec(change.files), { language: session.lang }).spec
    .frontmatter;
  const open = (await locateChanges(session)).find(
    (located) => located.change.state.id === epic && !isFinished(located.change.state),
  );
  if (epic === undefined || open === undefined) return undefined;
  const there = open.session.root;
  await writeBinding(session.git, conversation, {
    folder: there,
    at: session.environment.now().toISOString(),
  });
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  return { id: epic, folder: there, inMain: (await resolved(there)) === (await resolved(main)) };
}

/** The conversation that runs the command, when it is bound to `folder`. */
async function conversationIn(session: Session, folder: string): Promise<string | undefined> {
  const id = session.conversation?.id;
  const binding = id === undefined ? undefined : await readBinding(session.git, id);
  if (binding === undefined) return undefined;
  return (await resolved(binding.folder)) === (await resolved(folder)) ? id : undefined;
}

/**
 * The changes whose spec names `epic`: the open one of each worktree, and the archived ones of
 * this folder and of the main one, where a closed change lands once it is incorporated.
 */
async function childrenOf(session: Session, epic: string): Promise<Child[]> {
  const open = await openChildren(session, epic);
  const known = new Set([epic, ...open.map(({ id }) => id)]);
  return [...open, ...(await archivedChildren(session, epic, known))];
}

/** The change of each worktree whose spec names `epic`, with its folder while it is open. */
async function openChildren(session: Session, epic: string): Promise<Child[]> {
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
  return children;
}

/** The archived changes whose spec names `epic`, here and in the main folder, but the `known` ones. */
async function archivedChildren(
  session: Session,
  epic: string,
  known: ReadonlySet<string>,
): Promise<Child[]> {
  const children: Child[] = [];
  const seen = new Set(known);
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
