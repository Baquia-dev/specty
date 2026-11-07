// SPDX-License-Identifier: Apache-2.0
// A change as the panel counts it (docs/ui.md, «Panel»): who it is for and what happened when,
// from its state and its audit (formats.md §3 and §4).
import type { ChangeState } from "../schema/state";
import type { ChangeKind } from "../spec/model";
import { dayOf } from "./period";

/** A change for the panel: who, and each fact with its local day (YYYY-MM-DD). */
export interface StatsRow {
  readonly id: string;
  readonly kind: ChangeKind;
  /** `approved.by` of its state or, without it, the last `by` of its audit. */
  readonly person?: string;
  /** The `tool` of most of its `actor: agent` lines. */
  readonly agent?: string;
  /** The `model` of most of its lines. */
  readonly model?: string;
  /** ISO time of its `change.created`, or of its first line. */
  readonly created: string;
  /** ISO time it closed: its `change.closed` or, for a retro, its `retro.confirmed`. */
  readonly closed?: string;
  /** The days of its first and last lines: while it lived. */
  readonly lived: { readonly from: string; readonly to: string };
  /** The day of each `task.completed`. */
  readonly tasks: readonly string[];
  /** Each `task.verified`: its day and whether it passed (`exit: 0`). */
  readonly verifications: readonly { readonly day: string; readonly passed: boolean }[];
  /** Each `change.usage` with a `cost`: its day and the cost, in US dollars. */
  readonly costs: readonly { readonly day: string; readonly cost: number }[];
}

/** An audit line, with what the panel reads of it. */
interface Line {
  readonly ts: string;
  readonly event: string;
  readonly actor?: unknown;
  readonly tool?: unknown;
  readonly by?: unknown;
  readonly model?: unknown;
  readonly data: Readonly<Record<string, unknown>>;
}

/** The row of a change; none when its audit has no line to date it. */
export function statsRow(
  state: Pick<ChangeState, "id" | "kind" | "approved">,
  audit: readonly unknown[],
): StatsRow | undefined {
  const lines = audit.flatMap(lineOf);
  const first = lines[0];
  const last = lines.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const created = lines.find((line) => line.event === "change.created")?.ts ?? first.ts;
  const closing = state.kind === "retro" ? "retro.confirmed" : "change.closed";
  const closed = lines.findLast((line) => line.event === closing)?.ts;
  const person = state.approved?.by ?? lines.findLast((line) => isText(line.by))?.by;
  const agent = mostOf(lines.filter((line) => line.actor === "agent").map((line) => line.tool));
  const model = mostOf(lines.map((line) => line.model));
  return {
    id: state.id,
    kind: state.kind,
    ...(isText(person) ? { person } : {}),
    ...(agent === undefined ? {} : { agent }),
    ...(model === undefined ? {} : { model }),
    created,
    ...(closed === undefined ? {} : { closed }),
    lived: { from: dayOf(first.ts), to: dayOf(last.ts) },
    tasks: lines.filter((line) => line.event === "task.completed").map((line) => dayOf(line.ts)),
    verifications: lines
      .filter((line) => line.event === "task.verified")
      .map((line) => ({ day: dayOf(line.ts), passed: line.data.exit === 0 })),
    costs: lines.flatMap((line) => {
      const { cost } = line.data;
      return line.event === "change.usage" && typeof cost === "number"
        ? [{ day: dayOf(line.ts), cost }]
        : [];
    }),
  };
}

/** An entry of `audit.jsonl` with a valid time and an event; anything else, none. */
function lineOf(entry: unknown): Line[] {
  if (typeof entry !== "object" || entry === null) return [];
  const line: Readonly<Record<string, unknown>> = { ...entry };
  const { ts, event, data } = line;
  if (typeof ts !== "string" || Number.isNaN(Date.parse(ts)) || typeof event !== "string")
    return [];
  const fields: Readonly<Record<string, unknown>> =
    typeof data === "object" && data !== null ? { ...data } : {};
  return [{ ...line, ts, event, data: fields }];
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** The text most of `values` are, the first to appear on a tie; none without any. */
function mostOf(values: readonly unknown[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (isText(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  let most = 0;
  for (const [value, count] of counts) {
    if (count > most) {
      best = value;
      most = count;
    }
  }
  return best;
}
