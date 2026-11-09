// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { attendance, unattended } from "../src/person";
import { disposableRepo, git, write } from "../src/repo";

/** A short grace and a quick look, so each run takes a moment. */
const TIMING = { graceMs: 300, intervalMs: 20 };

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * An agent that runs `ms` unless the suite stops it first: when it was stopped, each time, on
 * `performance.now()`'s clock.
 */
function agent(ms: number) {
  const stops: number[] = [];
  let ended = false;
  const timer = setTimeout(() => {
    ended = true;
  }, ms);
  return {
    running: () => !ended,
    stop() {
      stops.push(performance.now());
      ended = true;
      clearTimeout(timer);
    },
    stops,
  };
}

/** A throwaway repository, as a scenario's, with no `specty wait` yet. */
const repo = () => disposableRepo({ "README.txt": "demo\n" });

/** The mark a `specty wait` writes in `root` when it waits for the person (formats.md §1). */
async function waits(root: string): Promise<number> {
  const path = git(root, "rev-parse", "--git-path", "common/specty/waits/20261109-x.json");
  const at = performance.now();
  await write(root, {
    [path]: `${JSON.stringify({ pid: process.pid, since: new Date().toISOString(), intervalMs: 500, timeoutSec: 3300 })}\n`,
  });
  return at;
}

describe("a run with nobody to decide", () => {
  it("AC1: once the agent waits for the person with `specty wait` and is still running after the grace, the suite stops it, long before its limit", async () => {
    const root = await repo();
    const run = agent(60_000);
    const started = performance.now();
    const watching = unattended(root, run, TIMING);
    await pause(100);
    await waits(root);
    await watching;
    expect(run.stops).toHaveLength(1);
    expect(run.running()).toBe(false);
    expect((run.stops[0] ?? 0) - started).toBeLessThan(5_000);
  });

  it("AC2: when the suite stopped it waiting, the moment it saw the wait counts, without the grace", async () => {
    const root = await repo();
    const run = agent(60_000);
    const watching = unattended(root, run, TIMING);
    await pause(100);
    const wrote = await waits(root);
    const waited = await watching;
    const [stopped = 0] = run.stops;
    expect(waited).toBeDefined();
    expect(waited ?? 0).toBeGreaterThanOrEqual(wrote);
    expect(waited ?? 0).toBeLessThan(wrote + TIMING.graceMs);
    expect(stopped - (waited ?? 0)).toBeGreaterThanOrEqual(TIMING.graceMs - 1);
  });

  it("AC2: an agent that ends on its own within the grace is not stopped, and its own end counts", async () => {
    const root = await repo();
    const run = agent(150);
    const watching = unattended(root, run, TIMING);
    await waits(root);
    expect(await watching).toBeUndefined();
    expect(run.stops).toEqual([]);
  });

  it("AC2: an agent that never waits runs until it ends, and its own end counts", async () => {
    const root = await repo();
    const run = agent(200);
    expect(await unattended(root, run, TIMING)).toBeUndefined();
    expect(run.stops).toEqual([]);
    expect(run.running()).toBe(false);
  });
});

describe("a run with a person who decides", () => {
  it("AC3: the suite does not stop the agent when it waits with `specty wait`; without the person, the same wait ends its turn", async () => {
    const root = await repo();
    await waits(root);
    const run = agent(500);
    expect(await attendance(root, run, true)).toBeUndefined();
    expect(run.stops).toEqual([]);
    // Without a person, the same wait ends the agent's turn.
    const alone = agent(60_000);
    expect(await attendance(root, alone, false, TIMING)).toBeDefined();
    expect(alone.stops).toHaveLength(1);
  });
});
