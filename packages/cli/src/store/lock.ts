// SPDX-License-Identifier: Apache-2.0
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { link, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isRecord, parseJson, readText } from "../io/files";
import type { Git } from "../io/git";

/**
 * The lock of a change (formats.md §1): a file shared by every worktree that one command at a
 * time holds, so that two commands changing the same change do not overwrite its state.
 */

/** Who holds a change's lock. */
export interface LockHolder {
  readonly pid: number;
  /** The subcommand, such as `accept` or `task done`. */
  readonly command: string;
  /** Absolute path of the folder it runs in. */
  readonly folder: string;
  /** ISO 8601, in UTC. */
  readonly at: string;
}

export type Lock =
  | { readonly kind: "taken"; release(): Promise<void> }
  | { readonly kind: "busy"; readonly holder: LockHolder };

// Under `common/`, git keeps a path in the common directory: one lock for every worktree.
const lockOf = (id: string) => `common/specty/locks/${id}.json`;
/** The turn of the full verification, one for the whole clone. */
const FULL_VERIFICATION = "common/specty/locks/full-verification.json";
/** The turn of `new`'s creation of a worktree on Windows, one for the whole clone. */
const NEW_CHANGE = "common/specty/locks/new.json";

/** The locks this process holds: a command run inside another one does not lock twice. */
const held = new Set<string>();

/**
 * The turns of the full verification held by the code that runs now: the one that took it and
 * what runs inside it (`onFullVerificationTurn`), as the verification of a closing's
 * incorporation. Another part of the same process, as the UI's server accepting a change while it
 * verifies another one, waits for the turn as another session would.
 */
const turns = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Takes the lock of change `id` for `holder`, unless a live process holds it. A lock whose
 * process no longer exists, or that cannot be read, does not count.
 */
export async function lockChange(git: Git, id: string, holder: LockHolder): Promise<Lock> {
  return lockAt(git, lockOf(id), holder);
}

/**
 * Takes the turn of the full verification for `holder`: one at a time in the whole clone, with
 * the same rules as a change's lock (formats.md §1), except that this process holding it does not
 * give it again: only what runs inside its holder has it (`holdsFullVerification`).
 */
export async function lockFullVerification(git: Git, holder: LockHolder): Promise<Lock> {
  return lockAt(git, FULL_VERIFICATION, holder, false);
}

/**
 * Takes the turn of `new` for `holder` (`onNewTurn`): one at a time in the whole clone, with the
 * same rules as a change's lock (formats.md §1), and not given again inside this process, so two
 * `new` of one process go one after the other too.
 */
export async function lockNewChange(git: Git, holder: LockHolder): Promise<Lock> {
  return lockAt(git, NEW_CHANGE, holder, false);
}

/** Whether the code that runs now holds the turn of the full verification, as a closing does. */
export async function holdsFullVerification(git: Git): Promise<boolean> {
  const path = await git.gitPath(FULL_VERIFICATION);
  return held.has(path) && turns.getStore()?.has(path) === true;
}

/**
 * Runs `run` with the turn of the full verification that it took (`lockFullVerification`): what
 * runs inside holds it too, and nothing else of this process does.
 */
export async function onFullVerificationTurn<T>(git: Git, run: () => Promise<T>): Promise<T> {
  const path = await git.gitPath(FULL_VERIFICATION);
  return turns.run(new Set([...(turns.getStore() ?? []), path]), run);
}

/** Takes the lock at `lock`; `again`, when this process holding it already gives it. */
async function lockAt(git: Git, lock: string, holder: LockHolder, again = true): Promise<Lock> {
  const path = await git.gitPath(lock);
  if (again && held.has(path)) return { kind: "taken", release: async () => undefined };
  await mkdir(dirname(path), { recursive: true });
  if (!(await create(path, holder))) {
    const current = await readHolder(path);
    if (current !== undefined && alive(current.pid)) return { kind: "busy", holder: current };
    const busy = await replaceDead(path, holder);
    if (busy !== undefined) return busy;
  }
  held.add(path);
  return {
    kind: "taken",
    release: async () => {
      held.delete(path);
      const current = await readHolder(path);
      if (current?.pid === holder.pid && current.at === holder.at)
        await unlink(path).catch(() => undefined);
    },
  };
}

type Busy = Extract<Lock, { readonly kind: "busy" }>;

/**
 * Replaces a lock whose process no longer exists under a short exclusive claim (`<lock>.claim`),
 * so two commands never both replace it: nothing once replaced, or who holds the claim or the
 * lock by then.
 */
async function replaceDead(path: string, holder: LockHolder): Promise<Busy | undefined> {
  const claim = `${path}.claim`;
  const claimant = await exclusive(claim, holder);
  if (claimant !== true) return { kind: "busy", holder: claimant };
  try {
    // With the claim, look again: another command may have replaced it in between.
    const current = await exclusive(path, holder);
    return current === true ? undefined : { kind: "busy", holder: current };
  } finally {
    await unlink(claim).catch(() => undefined);
  }
}

/** Creates `path` for `holder`, replacing it only when its process no longer exists: true, or who holds it. */
async function exclusive(path: string, holder: LockHolder): Promise<true | LockHolder> {
  for (const _attempt of [1, 2]) {
    if (await create(path, holder)) return true;
    const current = await readHolder(path);
    if (current !== undefined && alive(current.pid)) return current;
    await unlink(path).catch(() => undefined);
  }
  throw new Error(`${path}: the lock could not be taken`);
}

/** Who holds the lock of change `id`, when its process is alive. */
export async function liveHolder(git: Git, id: string): Promise<LockHolder | undefined> {
  const holder = await readHolder(await git.gitPath(lockOf(id)));
  return holder !== undefined && alive(holder.pid) ? holder : undefined;
}

/**
 * Creates the lock whole or not at all: written aside, then linked in place, which fails if it
 * exists. Each try writes its own draft: two of one process at once would share one by its pid.
 */
async function create(path: string, holder: LockHolder): Promise<boolean> {
  const draft = `${path}.${holder.pid}.${randomUUID()}.tmp`;
  await writeFile(draft, `${JSON.stringify(holder, null, 2)}\n`);
  try {
    await link(draft, path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "EEXIST") return false;
    throw error;
  } finally {
    await unlink(draft).catch(() => undefined);
  }
}

async function readHolder(path: string): Promise<LockHolder | undefined> {
  const value = parseJson(await readText(path));
  if (!isRecord(value)) return undefined;
  const { pid, command, folder, at } = value;
  return typeof pid === "number" &&
    typeof command === "string" &&
    typeof folder === "string" &&
    typeof at === "string"
    ? { pid, command, folder, at }
    : undefined;
}

/** Whether process `pid` exists on this machine; one of another user exists too. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}
