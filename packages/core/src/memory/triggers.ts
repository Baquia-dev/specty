// SPDX-License-Identifier: Apache-2.0
import type { MemoryEntry } from "./entries";

// The triggers of a reminder of Specty's memory (ADR 0016): a day it waits for (`due`), or the
// paths whose files bring it up. Until then it stays out of every session's cards.

/** `now`'s day in the machine's local time, as YYYY-MM-DD, the date the change ids use too. */
export function localDay(now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Whether `text` is a date of the calendar written as YYYY-MM-DD. */
export function isDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
  );
}

/**
 * The entries every session sees on `today`: all but the reminders that wait for a later day or
 * for their paths, which show in the cards of the tasks and drafts that touch them.
 */
export function sessionEntries(entries: readonly MemoryEntry[], today: string): MemoryEntry[] {
  return entries.filter((entry) => !waits(entry, today));
}

function waits(entry: MemoryEntry, today: string): boolean {
  if (entry.kind !== "reminder") return false;
  return entry.paths !== undefined || (entry.due !== undefined && entry.due > today);
}
