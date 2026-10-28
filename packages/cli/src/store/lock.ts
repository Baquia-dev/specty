// SPDX-License-Identifier: Apache-2.0
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

/** The locks this process holds: a command run inside another one does not lock twice. */
const held = new Set<string>();

/**
 * Takes the lock of change `id` for `holder`, unless a live process holds it. A lock whose
 * process no longer exists, or that cannot be read, does not count.
 */
export async function lockChange(git: Git, id: string, holder: LockHolder): Promise<Lock> {
  const path = await git.gitPath(lockOf(id));
  if (held.has(path)) return { kind: "taken", release: async () => undefined };
  await mkdir(dirname(path), { recursive: true });
  if (!(await create(path, holder))) {
    const current = await readHolder(path);
    if (current !== undefined && alive(current.pid)) return { kind: "busy", holder: current };
    await unlink(path).catch(() => undefined);
    if (!(await create(path, holder))) {
      // Another command took it in between.
      const winner = await readHolder(path);
      if (winner !== undefined) return { kind: "busy", holder: winner };
      throw new Error(`${path}: the lock could not be taken`);
    }
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

/** Creates the lock whole or not at all: written aside, then linked in place, which fails if it exists. */
async function create(path: string, holder: LockHolder): Promise<boolean> {
  const draft = `${path}.${holder.pid}.tmp`;
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
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}
