// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { mkdir, readdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionAt } from "../../test/server/support";
import { AGENT, APP, CONFIG, tempRepo } from "../../test/support";
import { oneAtATime } from "../flow/full-verification";
import { inSlots } from "./verify-slots";

const TURN = ".git/common/specty/locks/full-verification.queue";
const SLOTS = ".git/common/specty/locks/verify-slots.queue";

/** A repository whose queues' places go stale after `seconds`, or after today's 30 s without it. */
const repo = (seconds?: number) =>
  tempRepo({
    ...APP,
    ".specty/config.yaml":
      seconds === undefined
        ? CONFIG()
        : `${CONFIG()}internal:\n  waits:\n    queueStaleSec: ${seconds}\n`,
  });

/** A process that lives `ms` milliseconds, and when it ends, in milliseconds since the epoch. */
function living(ms: number) {
  const child = spawn(process.execPath, ["-e", `setTimeout(() => {}, ${ms})`]);
  const ended = new Promise<number>((done) => child.on("exit", () => done(Date.now())));
  return { pid: child.pid ?? 0, ended };
}

/** The place of process `pid`, first in `queue`, renewed for the last time 20 s ago. */
async function staleFirst(root: string, queue: string, pid: number): Promise<void> {
  await mkdir(join(root, queue), { recursive: true });
  const path = join(root, queue, `000000000000001-${pid}-1.json`);
  const holder = { pid, command: "pnpm check", folder: "/la/primera", at: "2026-11-07T10:00:00Z" };
  await writeFile(path, JSON.stringify(holder));
  const renewed = new Date(Date.now() - 20_000);
  await utimes(path, renewed, renewed);
}

/** When `run` starts in each queue of `root`, while process `pid` stays first in both. */
async function startsIn(root: string, pid: number) {
  const session = await sessionAt(root, AGENT);
  await staleFirst(root, TURN, pid);
  let turn = 0;
  await oneAtATime(
    session,
    "pnpm check",
    async () => {
      turn = Date.now();
    },
    { pollMs: 50 },
  );
  await staleFirst(root, SLOTS, pid);
  let slot = 0;
  await inSlots(
    session,
    1,
    "pnpm test",
    async () => {
      slot = Date.now();
    },
    { pollMs: 50 },
  );
  return { turn, slot };
}

describe("the life of a place in the verifications' queues", () => {
  it("AC1: with internal.waits.queueStaleSec, does not wait for a live process whose place went that long without renewing, and removes it", async () => {
    const root = await repo(10);
    const first = living(3000);
    const { turn, slot } = await startsIn(root, first.pid);
    const ended = await first.ended;
    expect(turn).toBeLessThan(ended);
    expect(slot).toBeLessThan(ended);
    expect(await readdir(join(root, TURN))).toEqual([]);
    expect(await readdir(join(root, SLOTS))).toEqual([]);
  });

  it("AC1: without the key, a place renewed 20 s ago still counts, so it waits for that process to end", async () => {
    const root = await repo();
    const first = living(800);
    const session = await sessionAt(root, AGENT);
    await staleFirst(root, TURN, first.pid);
    let turn = 0;
    await oneAtATime(
      session,
      "pnpm check",
      async () => {
        turn = Date.now();
      },
      { pollMs: 50 },
    );
    expect(turn).toBeGreaterThanOrEqual(await first.ended);
  });

  it("AC1: with a life longer than the place's silence, waits for that process to end in the places' queue too", async () => {
    const root = await repo(60);
    const first = living(800);
    const session = await sessionAt(root, AGENT);
    await staleFirst(root, SLOTS, first.pid);
    let slot = 0;
    await inSlots(
      session,
      1,
      "pnpm test",
      async () => {
        slot = Date.now();
      },
      { pollMs: 50 },
    );
    expect(slot).toBeGreaterThanOrEqual(await first.ended);
  });
});
