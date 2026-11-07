// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_CONFIG } from "@baquia-dev/specty-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Going, liveRun } from "../../src/server/run-output";
import type { Run } from "../../src/server/runs";

/** A full verification the UI started, with no output yet. */
const FIRST: Run = { command: "pnpm check", startedAt: "2026-11-07T10:00:00.000Z", output: [] };

/** The lines `from` to `to`, each its number. */
const lines = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index));

/** Where a run shows, with `limits`: the runs going on and what the listener heard. */
function shown(limits: { readonly runLines: number; readonly runEveryMs: number }) {
  const going: Going = new Map();
  const heard: (Run | undefined)[] = [];
  const target = { going, heard: (_: string, run: Run | undefined) => heard.push(run), limits };
  return { going, heard, live: liveRun(target, "c", FIRST, () => undefined) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a full verification's output, live in the server", () => {
  it("AC3: keeps only the last internal.server.runLines lines, among the runs going on and in what it tells", () => {
    const { going, heard, live } = shown({ runLines: 100, runEveryMs: 250 });
    live.add(lines(1, 150));
    live.add(lines(151, 300));
    expect(live.current().output).toEqual(lines(201, 300));
    expect(going.get("c")?.run.output).toEqual(lines(201, 300));
    vi.advanceTimersByTime(250);
    expect(heard.map((run) => run?.output)).toEqual([lines(201, 300)]);
  });

  it("AC3: keeps the last 1000 lines without the key", () => {
    const { live } = shown(DEFAULT_CONFIG.internal.server);
    live.add(lines(1, 1500));
    expect(live.current().output).toEqual(lines(501, 1500));
  });

  it("AC4: tells a run that moves at most every internal.server.runEveryMs", () => {
    const { heard, live } = shown({ runLines: 1000, runEveryMs: 10000 });
    live.add(["uno"]);
    vi.advanceTimersByTime(9999);
    live.add(["dos"]);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(heard.map((run) => run?.output)).toEqual([["uno", "dos"]]);
  });

  it("AC4: tells it every 250 ms without the key", () => {
    const { heard, live } = shown(DEFAULT_CONFIG.internal.server);
    live.add(["uno"]);
    vi.advanceTimersByTime(249);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(heard.map((run) => run?.output)).toEqual([["uno"]]);
  });
});
