// SPDX-License-Identifier: Apache-2.0
import type { PlatformPath } from "node:path";
import * as platformPath from "node:path";
import type { OpenFolder } from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
import { resolved } from "../io/git";
import type { Session } from "../session";

/** A worktree an action removes, as it names it. */
export interface Removal {
  /** Its path, from the folder the action runs in, or absolute. */
  readonly path?: string;
  /** The end of its path, which `git worktree remove` also takes. */
  readonly name?: string;
}

/**
 * The open changes' folders among the worktrees git lists that `removals` name: by their real
 * path, or by the end of their path, as git takes it. Only when some worktree goes does it look
 * for the open changes, as `status` lists them (`locateChanges`).
 */
export async function openFoldersRemoved(
  session: Session,
  cwd: string,
  removals: readonly Removal[],
): Promise<OpenFolder[]> {
  if (removals.length === 0) return [];
  const paths = removals.flatMap(({ path }) =>
    path === undefined ? [] : [platformPath.resolve(cwd, path)],
  );
  const targets = new Set(await Promise.all(paths.map(resolved)));
  const names = removals.flatMap(({ name }) => (name === undefined ? [] : [name]));
  const worktrees = await session.git.worktrees();
  const removed = await Promise.all(
    worktrees.map(async ({ folder }) => {
      const real = await resolved(folder);
      const named = names.some((name) => endsWithName(folder, name));
      return targets.has(real) || named ? [{ folder, real }] : [];
    }),
  );
  const gone = removed.flat();
  if (gone.length === 0) return [];
  const open = new Map<string, string>();
  for (const { change, session: there } of await locateChanges(session)) {
    if (!isFinished(change.state)) open.set(await resolved(there.root), change.state.id);
  }
  return gone.flatMap(({ folder, real }) => {
    const id = open.get(real);
    return id === undefined ? [] : [{ folder, id }];
  });
}

/**
 * Whether `name` is the end of `folder`'s path, in whole components, as `git worktree remove`
 * takes it, with or without the separators that may close it. On Windows `\` and `/` both
 * separate. `paths` is the platform's own but in tests.
 */
export function endsWithName(
  folder: string,
  name: string,
  paths: PlatformPath = platformPath,
): boolean {
  const slashed = (path: string) => (paths.sep === "\\" ? path.replaceAll("\\", "/") : path);
  const end = slashed(name).replace(/\/+$/, "");
  return end !== "" && `/${slashed(folder)}`.endsWith(`/${end}`);
}
