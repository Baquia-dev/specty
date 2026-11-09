// SPDX-License-Identifier: Apache-2.0
// The panel's cut (docs/ui.md, «Panel»): its period, who and lane, as the URL asks for them, the
// days of the period and of the one before, how a figure compares with the one before, and the
// sums and medians the sections count with.
import { localDay } from "../memory/triggers";
import { CHANGE_KINDS, type ChangeKind } from "../spec/model";
import type { StatsRow } from "./rows";

export const STATS_PERIODS = ["7d", "30d", "90d", "all"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/** The kinds of «Ver por», in its order. */
export const WHO_KINDS = ["person", "agent", "model"] as const;
export type StatsWhoKind = (typeof WHO_KINDS)[number];

/** One person, agent or model; an empty name is «(sin dato)»: the changes that do not say. */
export interface StatsWho {
  readonly kind: StatsWhoKind;
  readonly name: string;
}

/** What the panel looks at: a period, and maybe one person, agent or model, and one lane. */
export interface StatsQuery {
  readonly period: StatsPeriod;
  readonly who?: StatsWho;
  readonly kind?: ChangeKind;
}

/** Days of the calendar, local, as YYYY-MM-DD: both included. */
export interface StatsRange {
  readonly from: string;
  readonly to: string;
}

/** The URL's parameters, each one as it came, or none. */
interface QueryParams {
  readonly period?: string | null | undefined;
  readonly who?: string | null | undefined;
  readonly kind?: string | null | undefined;
}

/**
 * The cut that `params` ask for: each one understood, or its default, the last 30 days and
 * everyone. `who` is `person:<name>`, `agent:<tool>` or `model:<model>`; the name may be empty.
 */
export function statsQuery(params: QueryParams): StatsQuery {
  const period = STATS_PERIODS.find((known) => known === params.period) ?? "30d";
  const who = whoOf(params.who ?? "");
  const kind = CHANGE_KINDS.find((known) => known === params.kind);
  return {
    period,
    ...(who === undefined ? {} : { who }),
    ...(kind === undefined ? {} : { kind }),
  };
}

/** `kind:name`, split at its first colon; none for a kind the panel does not know. */
function whoOf(text: string): StatsWho | undefined {
  const colon = text.indexOf(":");
  const kind = WHO_KINDS.find((known) => known === text.slice(0, colon));
  return colon < 0 || kind === undefined ? undefined : { kind, name: text.slice(colon + 1) };
}

const DAYS: Readonly<Record<Exclude<StatsPeriod, "all">, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * The days of `period`, ending `today`, and those of the period just before, of the same length.
 * «all» starts on `first`, the day of the first change, and has none before.
 */
export function statsRanges(
  period: StatsPeriod,
  today: string,
  first: string,
): { readonly current: StatsRange; readonly previous?: StatsRange } {
  if (period === "all") return { current: { from: first < today ? first : today, to: today } };
  const days = DAYS[period];
  const from = addDays(today, 1 - days);
  return {
    current: { from, to: today },
    previous: { from: addDays(from, -days), to: addDays(from, -1) },
  };
}

/** The day `days` after `day`, or before it when negative. */
export function addDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/**
 * The local day of an ISO time, or of a time in milliseconds, as the change ids and the memory's
 * reminders count days.
 */
export function dayOf(time: string | number): string {
  return localDay(new Date(time));
}

export function inRange(day: string, range: StatsRange): boolean {
  return day >= range.from && day <= range.to;
}

/**
 * What finds the range of `ranges`, in order and none over another, that a day falls in: its
 * index, or -1 when it falls in none. It looks for each day once, halving them, and remembers it,
 * as the facts of many changes fall on few days.
 */
export function rangeFinder(ranges: readonly StatsRange[]): (day: string) => number {
  const found = new Map<string, number>();
  return (day) => {
    let index = found.get(day);
    if (index === undefined) {
      index = rangeIndex(ranges, day);
      found.set(day, index);
    }
    return index;
  };
}

/** The index of the range of `ranges`, in order and none over another, that `day` falls in. */
function rangeIndex(ranges: readonly StatsRange[], day: string): number {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const range = ranges[middle];
    if (range === undefined || day < range.from) high = middle - 1;
    else if (day > range.to) low = middle + 1;
    else return middle;
  }
  return -1;
}

/** Whether the change is one of the cut: of its person, agent or model, and of its lane. */
export function inCut(row: StatsRow, query: StatsQuery): boolean {
  if (query.kind !== undefined && row.kind !== query.kind) return false;
  const { who } = query;
  return who === undefined || (row[who.kind] ?? "") === who.name;
}

/**
 * How a figure compares with the period before: its value then and the change, (now − then) /
 * then. With no data then (no value, or nothing counted) or none now, the change is null.
 */
export function compared(
  value: number | null,
  previous: number | null,
): { readonly previous: number | null; readonly change: number | null } {
  const change =
    value === null || previous === null || previous === 0 ? null : (value - previous) / previous;
  return { previous, change };
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The middle value of `values`, or the mean of the two in the middle; none without any. */
export function median(values: readonly number[]): number | null {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? upper) + upper) / 2;
}
