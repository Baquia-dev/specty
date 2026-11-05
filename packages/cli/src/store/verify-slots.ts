// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifySlotsWaitNote } from "@baquia-dev/specty-core";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import { alive, type LockHolder } from "./lock";
import { joinQueue } from "./turn-queue";

/**
 * The clone's verification places (formats.md §1): one file per verification that runs, with the
 * places it takes, and the queue of those that wait for theirs, in order of arrival.
 */
const RUNNING = "common/specty/locks/verify-slots";
const QUEUE = "common/specty/locks/verify-slots.queue";

const POLL_MS = 2000;

/** A verification that runs, with the places it takes. */
interface Running {
  readonly holder: LockHolder;
  readonly weight: number;
}

/** Files this process wrote, so two of its own in the same millisecond do not collide. */
let written = 0;

/**
 * Runs `run`, the verification `command`, once `weight` of the clone's `verify.slots` places are
 * free; a weight above them takes them all, once nothing else runs. Those that wait go in order
 * of arrival: none overtakes the first, even when it waits for more places than are free. The
 * places are given back when `run` ends, also after a failure; a process that ended gives them
 * back to whoever looks next.
 */
export async function inSlots<T>(
  session: Session,
  weight: number,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number } = {},
): Promise<T> {
  const { git, lang } = session;
  const { slots } = session.config.verify;
  const need = Math.min(Math.max(weight, 1), slots);
  const holder = { pid: process.pid, command, folder: session.root, at: now(session) };
  const folder = await git.gitPath(RUNNING);
  const place = await joinQueue(git, QUEUE, holder);
  let said = false;
  try {
    for (;;) {
      const ahead = await place.ahead();
      const running = await runningIn(folder);
      const used = running.reduce((sum, { weight: taken }) => sum + taken, 0);
      if (ahead === 0 && used + need <= slots) {
        const mine = await take(folder, { holder, weight: need });
        await place.leave();
        try {
          return await run();
        } finally {
          await unlink(mine).catch(() => undefined);
        }
      }
      if (!said) {
        const views = running.map((entry) => entry.holder);
        session.environment.io.err(verifySlotsWaitNote(views, slots, lang, ahead));
        said = true;
      }
      await new Promise((done) => setTimeout(done, options.pollMs ?? POLL_MS));
    }
  } finally {
    await place.leave();
  }
}

const now = (session: Session) => session.environment.now().toISOString();

/** Writes the file of a verification that starts to run, and gives its path. */
async function take(folder: string, entry: Running): Promise<string> {
  await mkdir(folder, { recursive: true });
  written += 1;
  const name = `${String(Date.now()).padStart(15, "0")}-${entry.holder.pid}-${written}.json`;
  const path = join(folder, name);
  await writeFile(path, `${JSON.stringify({ ...entry.holder, weight: entry.weight }, null, 2)}\n`, {
    flag: "wx",
  });
  return path;
}

/** The verifications that run now; the file of one whose process ended is removed. */
async function runningIn(folder: string): Promise<Running[]> {
  const names = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(".json"));
  const read = await Promise.all(names.map((name) => runningAt(join(folder, name))));
  return read.flatMap((entry) => (entry === undefined ? [] : [entry]));
}

async function runningAt(path: string): Promise<Running | undefined> {
  const value = parseJson(await readText(path));
  if (!isRecord(value)) return undefined;
  const { pid, command, folder, at, weight } = value;
  if (typeof pid !== "number" || !alive(pid)) {
    await unlink(path).catch(() => undefined);
    return undefined;
  }
  const holder = {
    pid,
    command: typeof command === "string" ? command : "",
    folder: typeof folder === "string" ? folder : "",
    at: typeof at === "string" ? at : "",
  };
  return { holder, weight: typeof weight === "number" && weight > 0 ? weight : 1 };
}
