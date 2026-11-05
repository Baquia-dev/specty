// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, parseJson, readText } from "../io/files";
import type { Git } from "../io/git";
import { alive, type LockHolder } from "./lock";

/**
 * The queue of the full verification's turn (formats.md §1): one file per process that waits,
 * named by its arrival, so the turn goes in order of arrival and not to whoever looks first.
 */
const QUEUE = "common/specty/locks/full-verification.queue";

/** A waiter renews its file at each look; one this long without it stopped waiting. */
const STALE_MS = 30_000;

/** A place in the queue: how many wait before it, and leaving it. */
export interface QueuePlace {
  /** Renews this place and counts the live places before it, removing the ones that ended. */
  ahead(): Promise<number>;
  leave(): Promise<void>;
}

/** Places this process took, so two of its own in the same millisecond keep their order. */
let taken = 0;

/** Joins the queue of the full verification's turn for `holder`, after everyone already in it. */
export function joinTurnQueue(git: Git, holder: LockHolder): Promise<QueuePlace> {
  return joinQueue(git, QUEUE, holder);
}

/**
 * Joins the queue whose folder is git's path `name` for `holder`, after everyone already in it:
 * the full verification's turn, or the clone's verification places (`verify-slots.ts`).
 */
export async function joinQueue(git: Git, name: string, holder: LockHolder): Promise<QueuePlace> {
  const folder = await git.gitPath(name);
  await mkdir(folder, { recursive: true });
  taken += 1;
  const own = `${String(Date.now()).padStart(15, "0")}-${holder.pid}-${taken}.json`;
  const path = join(folder, own);
  await writeFile(path, `${JSON.stringify(holder, null, 2)}\n`, { flag: "wx" });
  return {
    async ahead() {
      const now = new Date();
      await utimes(path, now, now).catch(() => undefined);
      const names = (await readdir(folder).catch(() => [])).filter(
        (name) => name.endsWith(".json") && name < own,
      );
      const live = await Promise.all(names.map((name) => waiting(join(folder, name), now)));
      return live.filter(Boolean).length;
    },
    async leave() {
      await unlink(path).catch(() => undefined);
    },
  };
}

/** Whether the place at `path` still waits; one whose process ended or that went stale is removed. */
async function waiting(path: string, now: Date): Promise<boolean> {
  const [value, info] = await Promise.all([
    readText(path).then(parseJson),
    stat(path).catch(() => undefined),
  ]);
  if (info === undefined) return false;
  const pid = isRecord(value) && typeof value.pid === "number" ? value.pid : undefined;
  const fresh = now.getTime() - info.mtimeMs < STALE_MS;
  if (pid !== undefined && fresh && alive(pid)) return true;
  await unlink(path).catch(() => undefined);
  return false;
}
