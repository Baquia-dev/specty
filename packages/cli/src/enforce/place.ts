// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import {
  analyzeShell,
  type ForeignPath,
  type GhostPath,
  type GuardAction,
  isGoverned,
  type ShellAnalysis,
  type ShellFacts,
} from "@baquia-dev/specty-core";
import type { Redirect } from "../agents/adapter";
import { within } from "../flow/land";
import { lostChanges } from "../flow/lost";
import { type GhostPlace, ghostFolders, placePaths, sortGhosts } from "../flow/worktree";
import { pathsOf } from "../io/git";
import type { Session } from "../session";
import type { RawAction } from "./actions";
import { openFoldersRemoved } from "./removals";

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
  const { session, cwd } = place;
  if (raw.kind === "other") return raw;
  if (raw.kind === "files") return { kind: "files", ...(await placeFiles(place, raw)) };
  if (raw.kind === "remove-worktree") {
    const folders = await openFoldersRemoved(session, cwd, [{ path: raw.path }]);
    return { kind: "remove-worktree", folders };
  }
  if (raw.kind === "shell") return { kind: "shell", facts: await shellFacts(place, raw) };
  const { inside, foreign, ghosts } = await inRepo(place, raw.paths);
  // Reading is free, also inside a ghost folder.
  return raw.kind === "read"
    ? { kind: "read", paths: inside, foreign }
    : { kind: raw.kind, paths: inside, foreign, ghosts: await ghostsOf(session, ghosts) };
}

/**
 * What a shell command would do, as the guard judges it: its analysis, the governed files its
 * commits would take, the open changes' folders it would remove, whether it runs outside the
 * conversation's folder and, for a tool that says so, whether it runs in the background. Paths
 * the analysis cannot place (shell variables, `cd` to an unknown place) are not judged.
 */
async function shellFacts(
  place: Place,
  raw: Extract<RawAction, { readonly kind: "shell" }>,
): Promise<ShellFacts> {
  const { session, cwd, bound } = place;
  const analysis = analyzeShell(raw.command);
  const committedGoverned = (await commitsHere(session, cwd, analysis.commits))
    ? pathsOf([
        ...(await session.git.staged()),
        ...(await session.git.changedSince(await session.git.head())),
      ]).filter((path) => !path.startsWith(".specty/") && isGoverned(path, session.config))
    : [];
  const removedFolders = await openFoldersRemoved(session, cwd, analysis.worktreeRemovals);
  return {
    ...(removedFolders.length > 0 ? { removedFolders } : {}),
    specty: analysis.specty,
    unscopedNpx: analysis.unscopedNpx,
    bypass: analysis.bypass,
    refs: analysis.refs,
    committedGoverned,
    sleeps: analysis.sleeps,
    ...(raw.background === undefined ? {} : { background: raw.background }),
    ...(await placeFiles(place, analysis)),
    ...(bound !== undefined && (await runsOutside(analysis, cwd, bound))
      ? { elsewhere: { folder: bound, command: raw.command } }
      : {}),
  };
}

/**
 * Where the actions of a conversation go (`AgentAdapter.redirect`): the change's folder it
 * entered, where a path of another worktree becomes the same path; otherwise its tool's folder,
 * and nothing moves. A path of a ghost folder stays as it is, for the guard to deny it.
 */
export async function redirection({ session, cwd, bound }: Place): Promise<Redirect> {
  if (bound === undefined) return { folder: cwd, path: (path) => path };
  const worktrees = (await session.git.worktrees()).map(({ folder }) => folder);
  const ghostOf = await ghostFolders(session.git);
  return {
    folder: bound,
    path: (path) => {
      if (contains(bound, path) || ghostOf(path) !== undefined) return path;
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

/**
 * Whether `folder` is outside every folder of `workspace`, by their real paths: a tool may name
 * them through a symbolic link (`/var` and `/private/var` on macOS).
 */
export async function outOfReach(folder: string, workspace: readonly string[]): Promise<boolean> {
  const target = await realOrSame(folder);
  const roots = await Promise.all(workspace.map(realOrSame));
  return !roots.some((root) => contains(root, target));
}

async function realOrSame(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function contains(folder: string, path: string): boolean {
  const inner = relative(folder, path);
  return !inner.startsWith("..") && !isAbsolute(inner);
}

/**
 * Turns tool paths into repository-relative ones, and keeps apart those inside a ghost folder,
 * which git no longer knows (`ghostFolders`), and those inside another worktree: they belong to
 * another change, and a conversation that entered a change's folder is given the same path there.
 * Paths outside every worktree and paths git ignores (`node_modules/`, caches, builds) are not
 * governed code, so they are dropped.
 */
async function inRepo(
  { session, cwd, bound }: Place,
  paths: readonly string[],
): Promise<{
  readonly inside: string[];
  readonly foreign: readonly ForeignPath[];
  readonly ghosts: readonly GhostPlace[];
}> {
  const { ghosts, others } = await sortGhosts(
    session.git,
    paths.map((path) => resolve(cwd, path)),
  );
  const placed = await placePaths(session.git, others);
  // The root itself (`rm -rf .`) is never ignored, and git rejects an empty pathspec.
  const ignored = new Set(await session.git.ignored(placed.inside.filter((path) => path !== "")));
  const foreign =
    bound === undefined
      ? placed.foreign
      : placed.foreign.map((path) => ({
          ...path,
          instead: join(bound, relative(path.worktree, path.path)),
        }));
  return { inside: placed.inside.filter((path) => !ignored.has(path)), foreign, ghosts };
}

/**
 * The paths of ghost folders as the guard judges them: with the main folder, where the agent
 * carries on, and the open change whose lost folder each is, by its name. Only with some does the
 * guard look for the changes without a folder.
 */
async function ghostsOf(session: Session, ghosts: readonly GhostPlace[]): Promise<GhostPath[]> {
  if (ghosts.length === 0) return [];
  const main = (await session.git.worktrees())[0]?.folder ?? session.root;
  const lost = new Set((await lostChanges(session)).map(({ id }) => id));
  return ghosts.map((ghost) => {
    const id = basename(ghost.folder);
    return { ...ghost, main, ...(lost.has(id) ? { lost: id } : {}) };
  });
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

/**
 * What a command or a patch writes and deletes here, and apart, what it would change elsewhere:
 * in another worktree, or in a ghost folder.
 */
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
    ghosts: await ghostsOf(place.session, [...writes.ghosts, ...deletes.ghosts]),
  };
}
