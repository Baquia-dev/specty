// SPDX-License-Identifier: Apache-2.0
import { realpath } from "node:fs/promises";
import type { StatusEntry } from "@baquia-dev/specty-core";
import type { Session } from "../session";
import { type Activity, readActivity } from "../store/activity";
import { readWait, type WaitSeen } from "../store/waits";

const MINUTE_MS = 60_000;

/** The decisions of the person that hand the turn to the agent (`audit.jsonl`, formats.md §4). */
const DECISIONS: ReadonlySet<string> = new Set([
  "spec.approved",
  "tests.approved",
  "scope.decided",
  "review.changes_requested",
  "change.accepted",
  "adjust.requested",
  "change.closed",
]);

/**
 * Nobody picks up the person's last decision (ARCHITECTURE §15): when they took it and, if a
 * `specty wait` waited, its agent, how it ended and how many minutes ago; with no `wait`, the
 * conversation that stepped last in the change's folder, before the decision.
 */
export interface Unattended {
  readonly since: string;
  readonly wait?: {
    readonly tool?: string;
    readonly ended: "timeout" | "stopped";
    readonly ago: number;
  };
  readonly holder?: { readonly tool: string; readonly ago: number };
}

/** What it reads of each change: its id, its audit and the worktree it lives in. */
interface Read {
  readonly state: { readonly id: string };
  readonly audit?: readonly Readonly<Record<string, unknown>>[];
  readonly folder?: string;
}

/** A change whose last decision of the person nobody answered in its audit. */
interface Pending {
  readonly id: string;
  readonly since: string;
  readonly folder: string;
}

/**
 * The open changes that wait for the agent (`waitingFor`, by core's `changeWaitsFor`, also in
 * review once the person asked for changes) and that nobody picks up after the person's last
 * decision, by id: no line of the agent after it in the audit, no live `specty wait`, none that
 * ended picking it up, and no step of a conversation in the change's folder after it. The agents'
 * steps are read once, and only when some change is left with a decision nobody answered.
 */
export async function unattendedById(
  session: Session,
  entries: readonly StatusEntry[],
  records: readonly Read[],
): Promise<ReadonlyMap<string, Unattended>> {
  const pending = entries.flatMap((entry): Pending[] => {
    const record = records.find((one) => one.state.id === entry.id);
    if (record?.folder === undefined) return [];
    const decision = unansweredDecision(record.audit ?? []);
    if (decision === undefined || entry.waitingFor !== "agent") return [];
    return [{ id: entry.id, since: decision.ts, folder: record.folder }];
  });
  if (pending.length === 0) return new Map();
  const steps = await stepsByFolder(session);
  const found = await Promise.all(
    pending.map(async (change) => [change.id, await unattendedOf(session, change, steps)] as const),
  );
  return new Map(found.flatMap(([id, seen]) => (seen === undefined ? [] : [[id, seen] as const])));
}

/**
 * The person's last decision and when they took it, unless an agent wrote to the audit after it:
 * in delegated mode, the agent's own decisions are its lines (`actor: "agent"`).
 */
function unansweredDecision(
  audit: readonly Readonly<Record<string, unknown>>[],
): { readonly event: string; readonly ts: string } | undefined {
  const at = audit.findLastIndex(
    (line) => line.actor === "human" && typeof line.event === "string" && DECISIONS.has(line.event),
  );
  if (at < 0 || audit.slice(at + 1).some((line) => line.actor === "agent")) return undefined;
  const { event, ts } = audit[at] ?? {};
  return typeof event === "string" && typeof ts === "string" ? { event, ts } : undefined;
}

/** Whether nobody picks up the decision of `change`, and what happened (formats.md §1, `waits/`). */
async function unattendedOf(
  session: Session,
  change: Pending,
  steps: ReadonlyMap<string, Activity>,
): Promise<Unattended | undefined> {
  const now = session.environment.now();
  const since = Date.parse(change.since);
  const wait = await readWait(session.git, change.id, now);
  if (wait !== undefined && pickedUp(wait, since)) return undefined;
  const step = steps.get(await real(change.folder));
  if (step !== undefined && Date.parse(step.last) >= since) return undefined;
  const waited = wait === undefined ? undefined : waitThatEnded(wait, now);
  if (waited !== undefined) return { since: change.since, wait: waited };
  if (step === undefined) return { since: change.since };
  return { since: change.since, holder: { tool: step.tool, ago: minutesAgo(now, step.last) } };
}

/** The `wait` is alive, so it will pick up the decision, or it ended picking it up. */
function pickedUp(wait: WaitSeen, since: number): boolean {
  const { ended } = wait;
  return ended === undefined || (ended.reason === "decided" && Date.parse(ended.at) >= since);
}

/** A `wait` whose time ran out or that was cut off: its agent, how and how many minutes ago. */
function waitThatEnded(wait: WaitSeen, now: Date): Unattended["wait"] {
  const { ended } = wait;
  if (ended === undefined || ended.reason === "decided") return undefined;
  const tool = wait.tool === undefined ? {} : { tool: wait.tool };
  return { ...tool, ended: ended.reason, ago: minutesAgo(now, ended.at) };
}

/** The last step an agent's conversation took in each folder, by its real path. */
async function stepsByFolder(session: Session): Promise<ReadonlyMap<string, Activity>> {
  const last = new Map<string, Activity>();
  for (const step of await readActivity(session.git)) {
    const folder = await real(step.folder);
    const known = last.get(folder);
    if (known === undefined || Date.parse(step.last) > Date.parse(known.last))
      last.set(folder, step);
  }
  return last;
}

/** Whole minutes from `at` (ISO 8601) to `now`, never fewer than none. */
function minutesAgo(now: Date, at: string): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(at)) / MINUTE_MS));
}

/** The real path of `folder`, or `folder` itself when it no longer exists. */
async function real(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}
