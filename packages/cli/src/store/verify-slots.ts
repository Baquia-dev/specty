// SPDX-License-Identifier: Apache-2.0
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyFolderWaitNote, verifySlotsWaitNote } from "@baquia-dev/specty-core";
import { ancestors } from "../io/exec";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import { alive, type LockHolder } from "./lock";
import { joinQueue } from "./turn-queue";

/**
 * The clone's verification places (formats.md §1): one file per verification that runs, with the
 * places it takes, and the queue of those that wait for theirs, in order of arrival. A command of
 * `specty check` writes one too, with no places, to mark its folder while it runs.
 */
const RUNNING = "common/specty/locks/verify-slots";
const QUEUE = "common/specty/locks/verify-slots.queue";

/** A verification that runs, with the places it takes: none for a command of `specty check`. */
interface Running {
  /** Its file's name, which starts with when it started: of two, the lower wrote first. */
  readonly name: string;
  readonly holder: LockHolder;
  readonly weight: number;
}

/**
 * Which runs of another process in its folder make one wait: every one for a verification, and
 * only verifications, not other commands of `specty check`, for a command of `specty check`.
 */
type Blocks = (entry: Running) => boolean;
const EVERY: Blocks = () => true;
const VERIFICATIONS: Blocks = (entry) => entry.weight > 0;

/** Files this process wrote, so two of its own in the same millisecond do not collide. */
let written = 0;

/**
 * Runs `run`, the verification `command`, once `weight` of the clone's `verify.slots` places are
 * free and no run of another process goes on in its folder; a weight above them takes them all,
 * once nothing else runs. Those that wait go in order of arrival: none overtakes the first, even
 * when it waits for more places than are free or for its folder, and each looks again every
 * `internal.waits.verifyIntervalMs` (`pollMs`, in tests). It says once who runs in its folder,
 * and once who holds the places. The places are given back when `run` ends, also after a failure;
 * a process that ended gives them back to whoever looks next.
 */
export async function inSlots<T>(
  session: Session,
  weight: number,
  command: string,
  run: () => Promise<T>,
  options: { readonly pollMs?: number } = {},
): Promise<T> {
  const { git, lang, root } = session;
  const { slots } = session.config.verify;
  const pollMs = options.pollMs ?? session.config.internal.waits.verifyIntervalMs;
  const need = Math.min(Math.max(weight, 1), slots);
  const holder = { pid: process.pid, command, folder: root, at: now(session) };
  const folder = await git.gitPath(RUNNING);
  const staleSec = session.config.internal.waits.queueStaleSec;
  const place = await joinQueue(git, QUEUE, holder, { staleSec, pollMs });
  const say = sayingOnce(session);
  try {
    for (;;) {
      const ahead = await place.ahead();
      const running = await runningIn(folder);
      const holding = running.filter(VERIFICATIONS);
      const used = holding.reduce((sum, { weight: taken }) => sum + taken, 0);
      const busy = await othersIn(root, running, EVERY);
      if (ahead === 0 && used + need <= slots && busy.length === 0) {
        const name = await take(folder, { holder, weight: need });
        const done = await ranFirst(root, folder, name, EVERY, async () => {
          await place.leave();
          return run();
        });
        if (done !== undefined) return done.value;
      } else if (busy.length > 0) {
        say("folder", verifyFolderWaitNote(views(busy), lang));
      } else {
        say("slots", verifySlotsWaitNote(views(holding), slots, lang, ahead));
      }
      await new Promise((done) => setTimeout(done, pollMs));
    }
  } finally {
    await place.leave();
  }
}

/**
 * Runs `run`, the command `command` of `specty check`, once no verification of another process
 * goes on in its folder, saying once which; while it runs, its file, with no places, makes a
 * verification that arrives at the folder wait for it. It takes no places and joins no queue, so
 * it does not wait for the verifications of other folders, nor for other commands of `specty
 * check`. Where it cannot write its file, as in a sandbox that keeps `.git` read-only, it runs
 * without it.
 */
export async function inFolder<T>(
  session: Session,
  command: string,
  run: () => Promise<T>,
): Promise<T> {
  const { root, lang } = session;
  const pollMs = session.config.internal.waits.verifyIntervalMs;
  const folder = await session.git.gitPath(RUNNING).catch(() => undefined);
  if (folder === undefined) return run();
  const holder = { pid: process.pid, command, folder: root, at: now(session) };
  const say = sayingOnce(session);
  for (;;) {
    const busy = await othersIn(root, await runningIn(folder), VERIFICATIONS);
    if (busy.length === 0) {
      const name = await take(folder, { holder, weight: 0 }).catch(() => undefined);
      if (name === undefined) return run();
      const done = await ranFirst(root, folder, name, VERIFICATIONS, run);
      if (done !== undefined) return done.value;
    } else {
      say("folder", verifyFolderWaitNote(views(busy), lang));
    }
    await new Promise((done) => setTimeout(done, pollMs));
  }
}

const now = (session: Session) => session.environment.now().toISOString();

const views = (entries: readonly Running[]) => entries.map((entry) => entry.holder);

/** Writes each kind of note to the error output the first time only. */
function sayingOnce(session: Session): (kind: string, note: string) => void {
  const said = new Set<string>();
  return (kind, note) => {
    if (said.has(kind)) return;
    said.add(kind);
    session.environment.io.err(note);
  };
}

/**
 * Runs `run` with its file `name` written, unless a run of another process that `blocks` it in
 * its folder wrote its own first: of two that arrive at once, only the first runs, and the other
 * removes its file and waits. The file goes once `run` ends, also after a failure.
 */
async function ranFirst<T>(
  root: string,
  folder: string,
  name: string,
  blocks: Blocks,
  run: () => Promise<T>,
): Promise<{ readonly value: T } | undefined> {
  const path = join(folder, name);
  const before = (await othersIn(root, await runningIn(folder), blocks)).some(
    (entry) => entry.name < name,
  );
  if (before) {
    await unlink(path).catch(() => undefined);
    return undefined;
  }
  try {
    return { value: await run() };
  } finally {
    await unlink(path).catch(() => undefined);
  }
}

/** The processes that started this one, looked for once, and only when needed. */
let startedBy: Promise<ReadonlySet<number>> | undefined;

/**
 * The runs of `running` that `blocks` and go on in `root` for another process: neither this one,
 * whose own runs order themselves, nor one that started it, whose command may run Specty in its
 * own folder and would otherwise wait for itself.
 */
async function othersIn(
  root: string,
  running: readonly Running[],
  blocks: Blocks,
): Promise<Running[]> {
  const there = running.filter(
    (entry) => entry.holder.folder === root && entry.holder.pid !== process.pid && blocks(entry),
  );
  if (there.length === 0) return [];
  startedBy ??= ancestors();
  const started = await startedBy;
  return there.filter((entry) => !started.has(entry.holder.pid));
}

/** Writes the file of what starts to run, and gives its name. */
async function take(folder: string, entry: Omit<Running, "name">): Promise<string> {
  await mkdir(folder, { recursive: true });
  written += 1;
  const name = `${String(Date.now()).padStart(15, "0")}-${entry.holder.pid}-${written}.json`;
  const path = join(folder, name);
  await writeFile(path, `${JSON.stringify({ ...entry.holder, weight: entry.weight }, null, 2)}\n`, {
    flag: "wx",
  });
  return name;
}

/** What runs now; the file of one whose process ended is removed. */
async function runningIn(folder: string): Promise<Running[]> {
  const names = (await readdir(folder).catch(() => [])).filter((name) => name.endsWith(".json"));
  const read = await Promise.all(names.map((name) => runningAt(folder, name)));
  return read.flatMap((entry) => (entry === undefined ? [] : [entry]));
}

async function runningAt(folder: string, name: string): Promise<Running | undefined> {
  const path = join(folder, name);
  const value = parseJson(await readText(path));
  if (!isRecord(value)) return undefined;
  const { pid, command, folder: where, at, weight } = value;
  if (typeof pid !== "number" || !alive(pid)) {
    await unlink(path).catch(() => undefined);
    return undefined;
  }
  const holder = {
    pid,
    command: typeof command === "string" ? command : "",
    folder: typeof where === "string" ? where : "",
    at: typeof at === "string" ? at : "",
  };
  return { name, holder, weight: typeof weight === "number" && weight >= 0 ? weight : 1 };
}
