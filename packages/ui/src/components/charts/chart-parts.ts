// SPDX-License-Identifier: Apache-2.0
// What the panel's charts work out alike (docs/ui.md, «Panel»): an axis of round steps, the keys
// that go through their marks and the stretches of a line.
import type { ElementRef } from "@angular/core";

/** An axis: where it starts, where it ends and the values of its ticks. */
interface Scale {
  readonly low: number;
  readonly high: number;
  readonly ticks: readonly number[];
}

/**
 * About four round steps (1, 2 or 5 × 10ⁿ) from `low`: up to `fixed` when it is given, or to the
 * first step at or past `highest`; steps of 1 at least when `whole`.
 */
export function roundScale(
  low: number,
  highest: number,
  options: { readonly fixed?: number | undefined; readonly whole?: boolean } = {},
): Scale {
  const raw = (highest - low) / 4 || 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const round = [1, 2, 5, 10].map((times) => times * power).find((one) => one >= raw) ?? raw;
  const step = options.whole ? Math.max(1, round) : round;
  const high = options.fixed ?? low + Math.ceil((highest - low) / step) * step;
  // Rounded to a millionth, so 0.1 + 0.2 reads 0.3.
  const ticks = Array.from(
    { length: Math.floor((high - low) / step + 1e-6) + 1 },
    (_, index) => Math.round((low + index * step) * 1e6) / 1e6,
  );
  return { low, high, ticks };
}

/** The marks the keys go through: how many, the one with the tab stop and their buttons. */
interface Marks {
  readonly count: number;
  readonly current: number;
  readonly buttons: readonly ElementRef<HTMLElement>[];
  /** ↓ and ↑ go too, for marks one under another. */
  readonly vertical?: boolean;
}

/**
 * The arrows take the focus to the next or the previous mark, Home to the first and End to the
 * last; another key does nothing.
 */
export function moveFocus(event: KeyboardEvent, marks: Marks): void {
  const last = marks.count - 1;
  const [next, previous] = [marks.current + 1, marks.current - 1];
  const targets: Readonly<Record<string, number>> = {
    ...(marks.vertical === true ? { ArrowDown: next, ArrowUp: previous } : {}),
    ArrowRight: next,
    ArrowLeft: previous,
    Home: 0,
    End: last,
  };
  const target = targets[event.key];
  if (target === undefined) return;
  event.preventDefault();
  marks.buttons[Math.min(last, Math.max(0, target))]?.nativeElement.focus();
}

/** `text` with plain spaces: `Intl` puts a no-break one before «%». */
export function plain(text: string): string {
  return text.replace(/\s/g, " ");
}

/** A point of a line where it has a value. */
interface Placed {
  readonly x: number;
  readonly y: number;
}

/** The stretches of points that have a value, in order. */
export function stretchesOf(
  points: readonly { readonly x: number; readonly y: number | null }[],
): Placed[][] {
  const runs: Placed[][] = [];
  let current: Placed[] = [];
  for (const { x, y } of points) {
    if (y === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else current.push({ x, y });
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** The path of a stretch: from its first point, straight through the rest. */
export function linePath(run: readonly Placed[]): string {
  return run.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`).join("");
}
