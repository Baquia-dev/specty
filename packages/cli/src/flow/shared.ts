// SPDX-License-Identifier: Apache-2.0
import {
  isGoverned,
  matchesAny,
  type OutputBlock,
  parseSpec,
  type Spec,
  section,
  sharedLine,
  sharedTitle,
} from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { readSpec } from "../store/changes";
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
