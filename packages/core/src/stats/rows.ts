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
  /** Each agent session that worked on it (the `session` of its lines), once per day it did. */
  readonly sessions: readonly { readonly id: string; readonly day: string }[];
  /** ISO time of its first `spec.proposed`. */
  readonly proposed?: string;
  /** ISO time of its last `task.completed`. */
  readonly completed?: string;
  /**
   * Each `spec.approved`: its ISO time; who gave it, the agent in delegated mode, the terminal or
   * the UI (a pull request counts with it); the `spec.proposed` since the approval before, and
   * its review, the milliseconds from the first of them to it, none without any.
   */
  readonly approvals: readonly {
    readonly at: string;
    readonly channel: "delegated" | "tty" | "ui";
    readonly proposals: number;
    readonly review: number | null;
  }[];
  /** Each `change.verified`: its day and whether it passed (`exit: 0`; a timeout has none). */
  readonly full: readonly { readonly day: string; readonly passed: boolean }[];
  /** Each `tests.proposed` and `tests.locked`: its day, which one, and its files. */
  readonly contract: readonly {
    readonly day: string;
    readonly locked: boolean;
    readonly files: readonly string[];
  }[];
  /**
   * Each `task.completed` that left something to note: its day, its risk findings, its long
   * files and the assertions it removed from tests that existed.
   */
  readonly findings: readonly {
    readonly day: string;
    readonly risks: number;
    readonly longFiles: number;
    readonly removed: number;
  }[];
}

/** An audit line, with what the panel reads of it. */
interface Line {
  readonly ts: string;
  readonly event: string;
  readonly actor?: unknown;
  readonly tool?: unknown;
  readonly by?: unknown;
  readonly model?: unknown;
  readonly session?: unknown;
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
    sessions: sessionsOf(lines),
    ...flowOf(lines),
    ...qualityOf(lines),
  };
}

/** When the phases of the change ended, and each approval of its spec. */
function flowOf(lines: readonly Line[]): Pick<StatsRow, "proposed" | "completed" | "approvals"> {
  const proposed = lines.find((line) => line.event === "spec.proposed")?.ts;
  const completed = lines.findLast((line) => line.event === "task.completed")?.ts;
  const approvals: StatsRow["approvals"][number][] = [];
  let first: string | undefined;
  let proposals = 0;
  for (const line of lines) {
    if (line.event === "spec.proposed") {
      first ??= line.ts;
      proposals += 1;
    } else if (line.event === "spec.approved") {
      const review = first === undefined ? null : Date.parse(line.ts) - Date.parse(first);
      approvals.push({ at: line.ts, channel: channelOf(line.data), proposals, review });
      first = undefined;
      proposals = 0;
    }
  }
  return {
    ...(proposed === undefined ? {} : { proposed }),
    ...(completed === undefined ? {} : { completed }),
    approvals,
  };
}

/** Who approved: the agent in delegated mode, the terminal, or the UI, a pull request too. */
function channelOf(data: Line["data"]): StatsRow["approvals"][number]["channel"] {
  if (data.delegated === true || data.channel === "delegated") return "delegated";
  return data.channel === "tty" ? "tty" : "ui";
}

/** What Specty checked: the full verifications, the contract tests and what the tasks left. */
function qualityOf(lines: readonly Line[]): Pick<StatsRow, "full" | "contract" | "findings"> {
  return {
    full: lines
      .filter((line) => line.event === "change.verified")
      .map((line) => ({ day: dayOf(line.ts), passed: line.data.exit === 0 })),
    contract: lines.flatMap((line) =>
      line.event === "tests.proposed" || line.event === "tests.locked"
        ? [
            {
              day: dayOf(line.ts),
              locked: line.event === "tests.locked",
              files: textsOf(line.data.files),
            },
          ]
        : [],
    ),
    findings: lines.flatMap((line) => {
      if (line.event !== "task.completed") return [];
      const { risks, longFiles, removedAssertions } = line.data;
      const found = {
        day: dayOf(line.ts),
        risks: Array.isArray(risks) ? risks.length : 0,
        longFiles: Array.isArray(longFiles) ? longFiles.length : 0,
        removed: removedOf(removedAssertions),
      };
      return found.risks + found.longFiles + found.removed === 0 ? [] : [found];
    }),
  };
}

/** The texts of a list; none of what is not one. */
function textsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isText) : [];
}

/** The assertions removed, summed over the files of `removedAssertions`. */
function removedOf(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let removed = 0;
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || !("removed" in entry)) continue;
    if (typeof entry.removed === "number") removed += entry.removed;
  }
  return removed;
}

/** Each session of `lines` with each day it has a line on, once. */
function sessionsOf(lines: readonly Line[]): { readonly id: string; readonly day: string }[] {
  const found = new Map<string, { readonly id: string; readonly day: string }>();
  for (const line of lines) {
    if (!isText(line.session)) continue;
    const day = dayOf(line.ts);
    found.set(`${line.session} ${day}`, { id: line.session, day });
  }
  return [...found.values()];
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
