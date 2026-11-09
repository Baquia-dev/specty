// SPDX-License-Identifier: Apache-2.0
// A change as the panel counts it (docs/ui.md, «Panel»): who it is for and what happened when,
// from its state and its audit (formats.md §3 and §4).
import type { ChangeState } from "../schema/state";
import type { ChangeKind } from "../spec/model";
import { dayOf } from "./period";

/** A change for the panel: who, and each fact with its local day (YYYY-MM-DD). */
export interface StatsRow {
  readonly id: string;
  /** The title of its spec, when whoever reads the rows reads the specs too; `statsRow` has none. */
  readonly title?: string;
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
  /** The local day of `closed`, which the panel counts it by. */
  readonly closedDay?: string;
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
   * Each `spec.approved`: its ISO time and its local day; who gave it, the agent in delegated
   * mode, the terminal or the UI (a pull request counts with it); the `spec.proposed` since the
   * approval before, and its review, the milliseconds from the first of them to it, none without
   * any.
   */
  readonly approvals: readonly {
    readonly at: string;
    readonly day: string;
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
  /** Each `change.usage`: its day, its calls to the model and its tokens of each type, 0 unsaid. */
  readonly usage: readonly {
    readonly day: string;
    readonly calls: number;
    readonly input: number;
    readonly output: number;
    readonly cacheWrite: number;
    readonly cacheRead: number;
  }[];
  /** Each `scope.decided` with a decision it knows: its day and the decision. */
  readonly scope: readonly { readonly day: string; readonly decision: ScopeDecision }[];
  /** Each `integration.started` with a reason it knows: its day and why the merge stopped. */
  readonly integrations: readonly { readonly day: string; readonly reason: StopReason }[];
  /** The day of each `adjust.requested`. */
  readonly adjustments: readonly string[];
}

/** How a scope request was decided: by Specty on its own, approved or rejected. */
const SCOPE_DECISIONS = ["auto", "approved", "rejected"] as const;
type ScopeDecision = (typeof SCOPE_DECISIONS)[number];

/** Why a merge of main stopped for the agent: its verification failed, or it has conflicts. */
const STOP_REASONS = ["verify", "conflicts"] as const;
type StopReason = (typeof STOP_REASONS)[number];

/** An audit line, with what the panel reads of it. */
interface Line {
  readonly ts: string;
  /** `ts` in milliseconds, read once. */
  readonly time: number;
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
  const lines = linesOf(audit);
  const first = lines[0];
  const last = lines.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const found = gathered(lines, state.kind === "retro" ? "retro.confirmed" : "change.closed");
  const { closed } = found;
  return {
    id: state.id,
    kind: state.kind,
    ...whoOf(state, found),
    created: found.created ?? first.ts,
    ...(closed === undefined ? {} : { closed, closedDay: dayOf(closed) }),
    lived: { from: dayOf(first.time), to: dayOf(last.time) },
    ...factsOf(found),
  };
}

/** What the row takes from the lines of a change, gathered going through them once. */
interface Gathered {
  created?: string;
  closed?: string;
  /** The last `by` of its lines. */
  by?: string;
  /** How many `actor: agent` lines have each `tool`, and how many lines each `model`. */
  readonly tools: Map<string, number>;
  readonly models: Map<string, number>;
  readonly sessions: Map<string, StatsRow["sessions"][number]>;
  proposed?: string;
  completed?: string;
  /** The first `spec.proposed` since the approval before, if any, and how many there were. */
  since: string | undefined;
  proposals: number;
  readonly tasks: string[];
  readonly verifications: StatsRow["verifications"][number][];
  readonly costs: StatsRow["costs"][number][];
  readonly approvals: StatsRow["approvals"][number][];
  readonly full: StatsRow["full"][number][];
  readonly contract: StatsRow["contract"][number][];
  readonly findings: StatsRow["findings"][number][];
  readonly usage: StatsRow["usage"][number][];
  readonly scope: StatsRow["scope"][number][];
  readonly integrations: StatsRow["integrations"][number][];
  readonly adjustments: string[];
}

/** What `lines` tell, each line read once: `closing` is the event that closes the change. */
function gathered(lines: readonly Line[], closing: string): Gathered {
  const found: Gathered = {
    tools: new Map(),
    models: new Map(),
    sessions: new Map(),
    since: undefined,
    proposals: 0,
    tasks: [],
    verifications: [],
    costs: [],
    approvals: [],
    full: [],
    contract: [],
    findings: [],
    usage: [],
    scope: [],
    integrations: [],
    adjustments: [],
  };
  for (const line of lines) {
    whoIn(line, found);
    if (line.event === closing) found.closed = line.ts;
    GATHER.get(line.event)?.(line, found);
  }
  return found;
}

/** Who the line tells: its `by`, its agent's tool, its model and its session. */
function whoIn(line: Line, found: Gathered): void {
  if (isText(line.by)) found.by = line.by;
  if (line.actor === "agent") counted(found.tools, line.tool);
  counted(found.models, line.model);
  if (!isText(line.session)) return;
  const day = dayOf(line.time);
  found.sessions.set(`${line.session} ${day}`, { id: line.session, day });
}

function counted(counts: Map<string, number>, value: unknown): void {
  if (isText(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
}

/** Its person, agent and model, the ones it has. */
function whoOf(
  state: Pick<ChangeState, "approved">,
  found: Gathered,
): Pick<StatsRow, "person" | "agent" | "model"> {
  const person = state.approved?.by ?? found.by;
  const agent = mostOf(found.tools);
  const model = mostOf(found.models);
  return {
    ...(isText(person) ? { person } : {}),
    ...(agent === undefined ? {} : { agent }),
    ...(model === undefined ? {} : { model }),
  };
}

/** The facts of the row, each with its day, and when its phases ended. */
function factsOf(found: Gathered): Omit<StatsRow, "id" | "kind" | "created" | "lived"> {
  const { proposed, completed } = found;
  return {
    tasks: found.tasks,
    verifications: found.verifications,
    costs: found.costs,
    sessions: [...found.sessions.values()],
    ...(proposed === undefined ? {} : { proposed }),
    ...(completed === undefined ? {} : { completed }),
    approvals: found.approvals,
    full: found.full,
    contract: found.contract,
    findings: found.findings,
    usage: found.usage,
    scope: found.scope,
    integrations: found.integrations,
    adjustments: found.adjustments,
  };
}

/** What each event the panel counts adds to the row; the others add nothing. */
const GATHER = new Map<string, (line: Line, found: Gathered) => void>([
  [
    "change.created",
    (line, found) => {
      found.created ??= line.ts;
    },
  ],
  ["task.completed", completedIn],
  [
    "task.verified",
    (line, found) => {
      found.verifications.push({ day: dayOf(line.time), passed: line.data.exit === 0 });
    },
  ],
  ["change.usage", usageIn],
  [
    "change.verified",
    (line, found) => {
      found.full.push({ day: dayOf(line.time), passed: line.data.exit === 0 });
    },
  ],
  ["tests.proposed", (line, found) => contractIn(line, found, false)],
  ["tests.locked", (line, found) => contractIn(line, found, true)],
  [
    "scope.decided",
    (line, found) => {
      const decision = SCOPE_DECISIONS.find((known) => known === line.data.decision);
      if (decision !== undefined) found.scope.push({ day: dayOf(line.time), decision });
    },
  ],
  [
    "integration.started",
    (line, found) => {
      const reason = STOP_REASONS.find((known) => known === line.data.reason);
      if (reason !== undefined) found.integrations.push({ day: dayOf(line.time), reason });
    },
  ],
  [
    "adjust.requested",
    (line, found) => {
      found.adjustments.push(dayOf(line.time));
    },
  ],
  ["spec.proposed", proposedIn],
  ["spec.approved", approvedIn],
]);

/** A task completed: its day, when, and what it left to note, if anything. */
function completedIn(line: Line, found: Gathered): void {
  const day = dayOf(line.time);
  found.tasks.push(day);
  found.completed = line.ts;
  const { risks, longFiles, removedAssertions } = line.data;
  const noted = {
    day,
    risks: Array.isArray(risks) ? risks.length : 0,
    longFiles: Array.isArray(longFiles) ? longFiles.length : 0,
    removed: removedOf(removedAssertions),
  };
  if (noted.risks + noted.longFiles + noted.removed > 0) found.findings.push(noted);
}

/** A `change.usage`: its cost, if it has one, and its calls and tokens, 0 unsaid. */
function usageIn(line: Line, found: Gathered): void {
  const day = dayOf(line.time);
  const { cost, calls, input, output, cacheWrite, cacheRead } = line.data;
  if (typeof cost === "number") found.costs.push({ day, cost });
  const count = (value: unknown) => (typeof value === "number" ? value : 0);
  found.usage.push({
    day,
    calls: count(calls),
    input: count(input),
    output: count(output),
    cacheWrite: count(cacheWrite),
    cacheRead: count(cacheRead),
  });
}

function contractIn(line: Line, found: Gathered, locked: boolean): void {
  found.contract.push({ day: dayOf(line.time), locked, files: textsOf(line.data.files) });
}

function proposedIn(line: Line, found: Gathered): void {
  found.proposed ??= line.ts;
  found.since ??= line.ts;
  found.proposals += 1;
}

/** An approval of the spec, with the proposals since the one before and their review. */
function approvedIn(line: Line, found: Gathered): void {
  const { ts: at } = line;
  const review = found.since === undefined ? null : Date.parse(at) - Date.parse(found.since);
  const { proposals } = found;
  const day = dayOf(line.time);
  found.approvals.push({ at, day, channel: channelOf(line.data), proposals, review });
  found.since = undefined;
  found.proposals = 0;
}

/** Who approved: the agent in delegated mode, the terminal, or the UI, a pull request too. */
function channelOf(data: Line["data"]): StatsRow["approvals"][number]["channel"] {
  if (data.delegated === true || data.channel === "delegated") return "delegated";
  return data.channel === "tty" ? "tty" : "ui";
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

/** The entries of `audit.jsonl` with a valid time and an event, in order. */
function linesOf(audit: readonly unknown[]): Line[] {
  const lines: Line[] = [];
  for (const entry of audit) {
    const line = lineOf(entry);
    if (line !== undefined) lines.push(line);
  }
  return lines;
}

/** An entry of `audit.jsonl` with a valid time and an event; anything else, none. */
function lineOf(entry: unknown): Line | undefined {
  if (typeof entry !== "object" || entry === null || !("ts" in entry) || !("event" in entry))
    return undefined;
  const { ts, event } = entry;
  if (typeof ts !== "string" || typeof event !== "string") return undefined;
  const time = Date.parse(ts);
  return Number.isNaN(time) ? undefined : lineFrom(entry, { ts, time, event });
}

/** The line of an entry, with its time and its event, read without copying the entry. */
function lineFrom(entry: object, { ts, time, event }: Pick<Line, "ts" | "time" | "event">): Line {
  const data = "data" in entry ? entry.data : undefined;
  return {
    ts,
    time,
    event,
    actor: "actor" in entry ? entry.actor : undefined,
    tool: "tool" in entry ? entry.tool : undefined,
    by: "by" in entry ? entry.by : undefined,
    model: "model" in entry ? entry.model : undefined,
    session: "session" in entry ? entry.session : undefined,
    data: typeof data === "object" && data !== null ? { ...data } : {},
  };
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** The text counted the most, the first to appear on a tie; none without any. */
function mostOf(counts: ReadonlyMap<string, number>): string | undefined {
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
