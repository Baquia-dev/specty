// SPDX-License-Identifier: Apache-2.0
import {
  type DuplicateFilesView,
  isGoverned,
  matchesAny,
  type OutputBlock,
  parseSpec,
  type Spec,
  section,
  sharedLine,
  sharedTitle,
} from "@baquia-dev/specty-core";
import { openChanges } from "../commands/status";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
import { type LiveHold, liveHolds } from "../store/front-owners";
import { readMemory } from "../store/memory";
import { isFinished } from "./active";
import { locateChanges } from "./changes";

/** A file a change plans to touch that other open changes also list. */
export interface Shared {
  readonly path: string;
  readonly changes: readonly string[];
}

/**
 * The governed `paths` of change `id` that other open changes, each read in its own worktree, also
 * list in their Files section or approved scope extensions. Globs match both ways. Documentation
 * and other ungoverned paths do not count: merges resolve them on their own.
 */
export async function sharedFiles(
  session: Session,
  id: string,
  paths: readonly string[],
): Promise<Shared[]> {
  const mine = [...new Set(paths)].filter((path) => isGoverned(path, session.config));
  if (mine.length === 0) return [];
  const located = (await locateChanges(session)).filter(
    ({ change }) => change.state.id !== id && !isFinished(change.state),
  );
  const others = await Promise.all(
    located.map(async ({ change, session: there }) => {
      const spec = parseSpec(await readSpec(change.files), { language: there.lang }).spec;
      const extras = Object.values(change.state.tasks).flatMap((task) => task.scopeExtra);
      const files = [...listed(spec), ...extras].filter((path) => isGoverned(path, there.config));
      return { id: change.state.id, files };
    }),
  );
  return mine.flatMap((path) => {
    const changes = others
      .filter(
        ({ files }) => matchesAny(path, files) || files.some((file) => matchesAny(file, [path])),
      )
      .map((other) => other.id);
    return changes.length === 0 ? [] : [{ path, changes }];
  });
}

/**
 * The open changes a spec shares at least half of its governed `paths` with (ADR 0016), as
 * `status` sees them; those in `skipped`, which the user told apart, do not count.
 */
export async function duplicatedBy(
  session: Session,
  paths: readonly string[],
  shared: readonly Shared[],
  skipped: ReadonlySet<string>,
): Promise<DuplicateFilesView[]> {
  const total = new Set(paths.filter((path) => isGoverned(path, session.config))).size;
  const counts = new Map<string, number>();
  for (const id of shared.flatMap(({ changes }) => changes)) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const half = [...counts].filter(([id, count]) => !skipped.has(id) && count * 2 >= total);
  if (half.length === 0) return [];
  const views = await openChanges(session);
  return half.flatMap(([id, count]) => {
    const change = views.find((view) => view.id === id);
    return change === undefined ? [] : [{ change, shared: count, total }];
  });
}

/** Every path a spec's Files section names, both sides of a rename. */
export function listed(spec: Spec): string[] {
  return (spec.sections.files?.items ?? []).flatMap((entry) =>
    entry.from === undefined ? [entry.path] : [entry.from, entry.path],
  );
}

/** One line per shared file: the file and the other changes that list it. */
export function sharedLines(session: Session, shared: readonly Shared[]): string[] {
  return shared.map(({ path, changes }) => sharedLine(path, changes, session.lang));
}

/** The "shared files" block of an output, or nothing when no file is shared. */
export function sharedBlock(session: Session, shared: readonly Shared[]): OutputBlock[] {
  return section(sharedTitle(session.lang), sharedLines(session, shared));
}

/**
 * The fronts of Specty's memory that a live conversation other than the session's holds, with the
 * governed `paths` that fall in their paths (ADR 0016): what `propose` warns about. Without
 * knowing the session's conversation, every front with an owner counts.
 */
export async function foreignFronts(
  session: Session,
  paths: readonly string[],
): Promise<{ readonly owner: LiveHold; readonly paths: readonly string[] }[]> {
  const mine = [...new Set(paths)].filter((path) => isGoverned(path, session.config));
  const { fronts } = await readMemory(session.git, session.config.memory.branch);
  if (mine.length === 0 || !fronts.some((front) => front.paths !== undefined)) return [];
  const { now } = session.environment;
  const live = await liveHolds(session.git, now(), session.config.memory.orphanAfterMin);
  const asker = session.conversation;
  return live.flatMap((owner) => {
    if (owner.tool === asker?.tool && owner.conversation === asker.id) return [];
    const covered = fronts.find((front) => front.name === owner.front)?.paths ?? [];
    const inside = mine.filter((path) => covered.length > 0 && matchesAny(path, covered));
    return inside.length === 0 ? [] : [{ owner, paths: inside }];
  });
}
