// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";
import {
  blockedCard,
  headerOf,
  type Output,
  type Phase,
  parseSpec,
  type SliceView,
  type Spec,
  transition,
  translator,
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
  const t = translator(session.lang);
  const { command } = session.cards;
  const refuse = (status: "invalid" | "blocked", reason: string, next: string): Output => ({
    ...blockedCard(headerOf(), reason, next),
    status,
  });
  if (epic === undefined || slice === undefined) {
    return refuse(
      "invalid",
      t(
        "`--epic` y `--slice` van juntos: la épica y el corte que implementa el cambio.",
        "`--epic` and `--slice` go together: the epic and the slice the change implements.",
      ),
      t(
        `ejecuta \`${command} new "<título>" --epic <épica> --slice <corte>\`.`,
        `run \`${command} new "<title>" --epic <epic> --slice <slice>\`.`,
      ),
    );
  }
  const found = (await locateChanges(session)).find(({ change }) => change.state.id === epic);
  if (found === undefined || found.change.state.kind !== "epic" || isFinished(found.change.state)) {
    return refuse(
      "invalid",
      t(`No hay ninguna épica abierta ${epic}.`, `There is no open epic ${epic}.`),
      t(`revisa su id con \`${command} status\`.`, `check its id with \`${command} status\`.`),
    );
  }
  const { phase } = found.change.state;
  const resume = t(
    `ejecuta \`${command} next\` en la carpeta de la épica, que dice qué corte sigue.`,
    `run \`${command} next\` in the epic's folder, which says which slice comes next.`,
  );
  if (phase !== "implementing") {
    return refuse(
      "blocked",
      t(
        `La épica ${epic} aún no está aprobada (fase ${phase}).`,
        `Epic ${epic} is not approved yet (phase ${phase}).`,
      ),
      resume,
    );
  }
  const spec = parseSpec(await readSpec(found.change.files), { language: session.lang }).spec;
  const slices = await sliceViews(found.session, found.change, spec);
  const target = slices.find((item) => item.id === slice);
  if (target === undefined) {
    const ids = slices.map(({ id }) => id).join(", ");
    return refuse(
      "invalid",
      t(
        `La épica ${epic} no tiene el corte ${slice}; sus cortes: ${ids}.`,
        `Epic ${epic} has no slice ${slice}; its slices: ${ids}.`,
      ),
      resume,
    );
  }
  if (target.child !== undefined) {
    return refuse(
      "blocked",
      t(
        `El corte ${slice} ya tiene un cambio: ${target.child.id}, en ${target.child.phase}.`,
        `Slice ${slice} already has a change: ${target.child.id}, in ${target.child.phase}.`,
      ),
      resume,
    );
  }
  if (target.status === "waiting") {
    const closed = new Set(slices.filter((item) => item.status === "done").map(({ id }) => id));
    const waiting = target.depends.filter((id) => !closed.has(id)).join(", ");
    return refuse(
      "blocked",
      t(
        `El corte ${slice} depende de cortes que aún no están cerrados: ${waiting}.`,
        `Slice ${slice} depends on slices that are not closed yet: ${waiting}.`,
      ),
      resume,
    );
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
