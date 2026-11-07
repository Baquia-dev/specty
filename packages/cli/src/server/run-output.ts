// SPDX-License-Identifier: Apache-2.0
import type { Run } from "./runs";

/**
 * The full verifications going on, by change, each with how to stop it and, for an
 * incorporation's, how it shows the verification that `runLive` keeps.
 */
export type Going = Map<string, { run: Run; stop: () => void; follow?: (run: Run) => void }>;

/** Where a run's output shows: among the runs going on, and to the listener. */
interface Shown {
  readonly going: Going;
  readonly heard: (id: string, run: Run | undefined) => void;
  /**
   * `internal.server` (formats.md §6): the last lines a run keeps, since its end is what matters,
   * and at most how often, in milliseconds, the listener hears a run that moves.
   */
  readonly limits: { readonly runLines: number; readonly runEveryMs: number };
}

/**
 * A run's output as it comes: kept among the runs going on, and heard at most every
 * `runEveryMs`.
 */
export interface LiveRun {
  add(lines: readonly string[]): void;
  /** The run as it is now. */
  current(): Run;
  /** Cancels the notice that was due; whether there was one. */
  settle(): boolean;
}

/** Part of a run's output: its own lines or, with `from`, those of a run `runLive` keeps. */
interface Part {
  readonly from?: string;
  readonly lines: readonly string[];
}

/**
 * With `follows`, the run also shows, after its own lines, those of each verification that
 * `runLive` keeps for the change (`follow`), one part per run: an incorporation's units, in turn.
 */
export function liveRun(
  target: Shown,
  id: string,
  first: Run,
  stop: () => void,
  follows = false,
): LiveRun {
  const { runLines, runEveryMs } = target.limits;
  let current = first;
  let parts: readonly Part[] = [{ lines: first.output }];
  let tell: NodeJS.Timeout | undefined;
  const keep = () => target.going.set(id, { run: current, stop, ...(follows ? { follow } : {}) });
  const show = (next: readonly Part[]) => {
    parts = next;
    current = { ...current, output: parts.flatMap(({ lines }) => lines).slice(-runLines) };
    keep();
    tell ??= setTimeout(() => {
      tell = undefined;
      target.heard(id, current);
    }, runEveryMs);
  };
  const follow = (run: Run) => {
    const from = `${run.startedAt} ${run.command}`;
    const part = { from, lines: run.output };
    const known = parts.some((each) => each.from === from);
    show(known ? parts.map((each) => (each.from === from ? part : each)) : [...parts, part]);
  };
  keep();
  return {
    add(lines) {
      if (lines.length === 0) return;
      const last = parts.at(-1);
      const own = last !== undefined && last.from === undefined;
      show(
        own
          ? [...parts.slice(0, -1), { lines: [...last.lines, ...lines].slice(-runLines) }]
          : [...parts, { lines }],
      );
    },
    current: () => current,
    settle() {
      const pending = tell !== undefined;
      clearTimeout(tell);
      return pending;
    },
  };
}
