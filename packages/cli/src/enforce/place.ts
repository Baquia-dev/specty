// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  analyzeShell,
  type ForeignPath,
  type GuardAction,
  isGoverned,
  type ShellAnalysis,
} from "@baquia-dev/specty-core";
import type { Redirect } from "../agents/adapter";
import { within } from "../flow/land";
import { placePaths } from "../flow/worktree";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { RawAction } from "./actions";

/**
 * Where an agent's action happens, as the guard places it: its session, the folder its tool works
 * in, and the change's folder its conversation entered (`specty enter`), where it works instead.
 */
export interface Place {
  readonly session: Session;
  readonly cwd: string;
  readonly bound?: string;
}

/**
 * A tool's action as the guard judges it: the paths it writes, deletes or reads placed in the
 * repository's worktrees, and a command's commits and the folders it runs in.
 */
export async function resolveAction(
  place: Place,
  raw: Exclude<RawAction, { readonly kind: "enter" }>,
): Promise<GuardAction> {
  const { session, cwd, bound } = place;
  if (raw.kind === "other") return raw;
  if (raw.kind === "files") return { kind: "files", ...(await placeFiles(place, raw)) };
  if (raw.kind !== "shell") {
    const { inside, foreign } = await inRepo(place, raw.paths);
    return { kind: raw.kind, paths: inside, foreign };
  }
  // Paths the analysis cannot place (shell variables, `cd` to an unknown place) are not judged.
  const analysis = analyzeShell(raw.command);
  const committedGoverned = (await commitsHere(session, cwd, analysis.commits))
    ? pathsOf([
        ...(await session.git.staged()),
        ...(await session.git.changedSince(await session.git.head())),
      ]).filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config))
    : [];
  return {
    kind: "shell",
    facts: {
      specty: analysis.specty,
      unscopedNpx: analysis.unscopedNpx,
      bypass: analysis.bypass,
      committedGoverned,
      ...(await placeFiles(place, analysis)),
      ...(bound !== undefined && (await runsOutside(analysis, cwd, bound))
        ? { elsewhere: { folder: bound, command: raw.command } }
        : {}),
    },
  };
}

/**
 * Where the actions of a conversation go (`AgentAdapter.redirect`): the change's folder it
 * entered, where a path of another worktree becomes the same path; otherwise its tool's folder,
 * and nothing moves.
 */
export async function redirection({ session, cwd, bound }: Place): Promise<Redirect> {
  if (bound === undefined) return { folder: cwd, path: (path) => path };
  const worktrees = (await session.git.worktrees()).map(({ folder }) => folder);
  return {
    folder: bound,
    path: (path) => {
      if (contains(bound, path)) return path;
      // A worktree nested in another owns its files.
      const owner = worktrees
        .filter((folder) => contains(folder, path))
        .reduce<string | undefined>(
          (best, folder) => (best === undefined || folder.length > best.length ? folder : best),
          undefined,
        );
      return owner === undefined ? path : join(bound, relative(owner, path));
    },
  };
}

function contains(folder: string, path: string): boolean {
  const inner = relative(folder, path);
  return !inner.startsWith("..") && !isAbsolute(inner);
}

/**
 * Turns tool paths into repository-relative ones, and keeps apart those inside another worktree:
 * they belong to another change, and a conversation that entered a change's folder is given the
 * same path there. Paths outside every worktree and paths git ignores (`node_modules/`, caches,
 * builds) are not governed code, so they are dropped.
 */
async function inRepo(
  { session, cwd, bound }: Place,
  paths: readonly string[],
): Promise<{ readonly inside: string[]; readonly foreign: readonly ForeignPath[] }> {
  const placed = await placePaths(
    session.git,
    paths.map((path) => resolve(cwd, path)),
  );
  // The root itself (`rm -rf .`) is never ignored, and git rejects an empty pathspec.
  const ignored = new Set(await session.git.ignored(placed.inside.filter((path) => path !== "")));
  const foreign =
    bound === undefined
      ? placed.foreign
      : placed.foreign.map((path) => ({
          ...path,
          instead: join(bound, relative(path.worktree, path.path)),
        }));
  return { inside: placed.inside.filter((path) => !ignored.has(path)), foreign };
}

/**
 * Whether a command would run outside the change's folder its conversation entered, wherever the
 * analysis can tell. `specty enter` runs anywhere: it moves the conversation.
 */
async function runsOutside(analysis: ShellAnalysis, cwd: string, bound: string): Promise<boolean> {
  if (analysis.enters.length > 0) return false;
  const known = analysis.runsIn.flatMap((folder) =>
    folder === undefined ? [] : [resolve(cwd, folder)],
  );
  return (await Promise.all(known.map((folder) => within(folder, bound)))).includes(false);
}

/**
 * Whether a commit of the command is this repository's: one whose folder the analysis cannot
 * name, or one inside any of its worktrees. A folder outside them all is another repository,
 * even if it does not exist yet (`cd /tmp/x && git init && git commit`).
 */
async function commitsHere(
  session: Session,
  cwd: string,
  commits: ShellAnalysis["commits"],
): Promise<boolean> {
  if (commits.some((commit) => commit.directory === undefined)) return true;
  const placed = await placePaths(
    session.git,
    commits.map((commit) => resolve(cwd, commit.directory ?? "")),
  );
  return placed.inside.length > 0 || placed.foreign.length > 0;
}

/** What a command or a patch writes and deletes here, and apart, what it would change elsewhere. */
async function placeFiles(
  place: Place,
  files: { readonly writes: readonly string[]; readonly deletes: readonly string[] },
) {
  const writes = await inRepo(place, files.writes);
  const deletes = await inRepo(place, files.deletes);
  return {
    writes: writes.inside,
    deletes: deletes.inside,
    foreign: [...writes.foreign, ...deletes.foreign],
  };
}
