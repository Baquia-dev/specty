// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type ChangeState,
  type ChangeView,
  type ConfigIssue,
  type Phase,
  parseSpec,
} from "@baquia-dev/specty-core";
import { openChanges } from "../commands/status";
import { isFinished } from "../flow/active";
import { locateChanges, unreadableChanges } from "../flow/changes";
import { criteriaTests } from "../flow/criteria-tests";
import { type LostChange, lostChanges } from "../flow/lost";
import { isRecord, parseJson, readText } from "../io/files";
import type { Session } from "../session";
import { listDir, loadState, readRevision } from "../store/changes";
import { type ChangeFiles, changeFiles, repoPaths } from "../store/paths";

/**
 * A change as the UI reads it (`ChangeRecord` in packages/ui/src/data/records.ts): its files as
 * they are, since when it is in its phase, and the folder it lives in.
 */
export interface ChangeRecord {
  readonly spec: string;
  readonly state: ChangeState;
  /** ISO time when the change entered its current phase. */
  readonly phaseSince: string;
  /** The worktree whose files these are; none for a change whose folder is lost. */
  readonly folder?: string;
  /** An open change whose folder is gone: its files come from its branch (`specty restore`). */
  readonly lost?: boolean;
  /** It waits for the agent and no conversation stepped in it nor wrote to it lately (`status`). */
  readonly orphan?: boolean;
  /** It waits for the agent and its conversation stepped last in another folder (`status`). */
  readonly away?: { readonly tool: string; readonly ago: number };
  /** `comments.json` (formats.md §5). */
  readonly comments?: readonly unknown[];
  /** The revision the person approved, `revisions/r<N>.md`. */
  readonly approvedSpec?: string;
  /** `audit.jsonl` (formats.md §4), oldest first. */
  readonly audit?: readonly Readonly<Record<string, unknown>>[];
  /** `verify.full` of the change's folder. */
  readonly verifyFull?: string;
  /** The independent reviews that answered (`review.completed` with a `file`), oldest first. */
  readonly reviews?: readonly ReviewRecord[];
  /** In acceptance, each criterion with the tests that carry its id (ADR 0014). */
  readonly criteriaTests?: NonNullable<ChangeView["criteriaTests"]>;
  /**
   * Its folder's `.specty/config.yaml` cannot be read: each issue, as the CLI prints it. No command
   * runs there; a server older than the Specty that wrote it sees this (ARCHITECTURE §15).
   */
  readonly configIssues?: readonly string[];
}

/** An independent review (ADR 0011): of the spec or of the result, with what the reviewer said. */
interface ReviewRecord {
  readonly target: "spec" | "diff";
  readonly revision: number;
  /** ISO time of its `review.completed`. */
  readonly at: string;
  readonly text: string;
}

/** The audit events that move a change into each phase: the last one says since when it is there. */
const ENTERS: Readonly<Record<Phase, readonly string[]>> = {
  draft: ["change.created"],
  review: ["spec.proposed"],
  testing: ["spec.approved"],
  // With contract, it leaves `testing` once the person approves the tests or a bug's red locks.
  implementing: ["spec.approved", "tests.approved", "tests.locked"],
  adjusting: ["adjust.requested"],
  acceptance: ["task.completed", "spec.approved"],
  closing: ["change.accepted"],
  done: ["change.closed", "change.accepted", "retro.confirmed"],
  cancelled: ["change.cancelled"],
};

/**
 * The open changes, once each: the open change of each worktree (and this folder's without a
 * branch of their own), then those whose folder is gone. What `GET /api/changes` gives: an
 * archived change comes in its page of finished ones (`finished.ts`) or by its id.
 */
export async function openRecords(session: Session): Promise<ChangeRecord[]> {
  return completed(session, await openOnes(session));
}

/**
 * Every change of the repository, once: the open ones, as `openRecords` gives them, then the
 * archived ones of each worktree, the main folder first, so a closed change that did not reach
 * the main branch still shows from its own worktree.
 */
export async function changeRecords(session: Session): Promise<ChangeRecord[]> {
  const { records, sessions } = await openOnes(session);
  const all = [...records];
  for (const record of await archivedRecords(session)) {
    if (!all.some((seen) => seen.state.id === record.state.id)) all.push(record);
  }
  return completed(session, { records: all, sessions });
}

/** The changes read, each id once, and the session of each open one, in its folder. */
interface Read {
  readonly records: readonly ChangeRecord[];
  readonly sessions: ReadonlyMap<string, Session>;
}

/** The open changes of each worktree, then those whose folder is gone, as their files are. */
async function openOnes(session: Session): Promise<Read> {
  const records: ChangeRecord[] = [];
  const add = (record: ChangeRecord | undefined) => {
    if (record !== undefined && !records.some((seen) => seen.state.id === record.state.id))
      records.push(record);
  };
  // The session of each open change, in its folder: its criteria's tests are read there.
  const sessions = new Map<string, Session>();
  for (const { change, session: there } of await locateChanges(session)) {
    if (isFinished(change.state)) continue;
    add(await readRecord(change.files, there.root, there.config.verify.full));
    sessions.set(change.state.id, there);
  }
  // The open changes of a folder whose configuration cannot be read: shown, with why.
  for (const { change, folder, issues } of await unreadableChanges(session)) {
    const record = await readRecord(change.files, folder, undefined);
    if (record !== undefined) add({ ...record, configIssues: issues.map(issueLine) });
  }
  // The open changes whose folder is gone, read from their branches (ARCHITECTURE §9).
  for (const lost of await lostChanges(session)) add(await lostRecord(session, lost));
  return { records, sessions };
}

/** A configuration's issue as the CLI prints it: `path: message`, or the message at the root. */
function issueLine({ path, message }: ConfigIssue): string {
  return path === "" ? message : `${path}: ${message}`;
}

/**
 * The records read, completed: the commit of each task done, the marks of who holds each and, in
 * acceptance, the tests of each criterion.
 */
async function completed(session: Session, { records, sessions }: Read): Promise<ChangeRecord[]> {
  const commits = await taskCommits(session);
  const holds = await holdsById(session);
  return Promise.all(
    records.map((record) => {
      const tasks = commits.get(record.state.id);
      const there = sessions.get(record.state.id);
      const withTasks = { ...withCommits(record, tasks), ...holds.get(record.state.id) };
      return there === undefined ? withTasks : withCriteriaTests(there, withTasks, tasks);
    }),
  );
}

/** An archived change the session read, and the time of its `state.json` then. */
interface Kept {
  readonly stamp: number;
  readonly record: ChangeRecord;
}

/** The archived changes each session already read, by their folder (the server keeps one). */
const KEPT = new WeakMap<Session, Map<string, Kept>>();

/**
 * The archived changes of every worktree, the main folder first, once each, without the commits
 * of their tasks. What the session already read stays in memory while its state keeps its time.
 */
export async function archivedRecords(session: Session): Promise<ChangeRecord[]> {
  const kept = KEPT.get(session) ?? new Map<string, Kept>();
  KEPT.set(session, kept);
  const records: ChangeRecord[] = [];
  const seen = new Set<string>();
  for (const { folder } of await session.git.worktrees()) {
    const { archive } = repoPaths(folder);
    for (const year of await listDir(archive)) {
      for (const id of await listDir(join(archive, year))) {
        if (seen.has(id)) continue;
        const record = await archivedRecord(kept, changeFiles(join(archive, year, id)), folder);
        if (record === undefined) continue;
        seen.add(id);
        records.push(record);
      }
    }
  }
  return records;
}

/** An archived change, from memory if its state kept its time; one that cannot be read, none. */
async function archivedRecord(
  kept: Map<string, Kept>,
  files: ChangeFiles,
  folder: string,
): Promise<ChangeRecord | undefined> {
  const stamp = await stat(files.state).then(
    (info) => info.mtimeMs,
    () => undefined,
  );
  if (stamp === undefined) return undefined;
  const known = kept.get(files.dir);
  if (known?.stamp === stamp) return known.record;
  const record = await readRecord(files, folder, undefined);
  if (record === undefined) kept.delete(files.dir);
  else kept.set(files.dir, { stamp, record });
  return record;
}

/** The change `id` as `changeRecords` gives it, open or archived; none when there is no such change. */
export async function changeRecord(
  session: Session,
  id: string,
): Promise<ChangeRecord | undefined> {
  return (await changeRecords(session)).find((record) => record.state.id === id);
}

/**
 * The open changes that wait for the agent with no conversation in their folder, by id, as
 * `status` marks them: orphans, and those whose conversation stepped last in another folder.
 */
async function holdsById(
  session: Session,
): Promise<ReadonlyMap<string, Pick<ChangeRecord, "orphan" | "away">>> {
  const holds = new Map<string, Pick<ChangeRecord, "orphan" | "away">>();
  for (const { id, orphan, away } of await openChanges(session)) {
    if (orphan !== true && away === undefined) continue;
    holds.set(id, {
      ...(orphan === true ? { orphan } : {}),
      ...(away !== undefined ? { away } : {}),
    });
  }
  return holds;
}

/**
 * In acceptance, each criterion with the tests that carry its id, as the acceptance card reads
 * them (`flow/criteria-tests.ts`); an epic's criteria are checked by its slices.
 */
async function withCriteriaTests(
  there: Session,
  record: ChangeRecord,
  commits: ReadonlyMap<string, string> | undefined,
): Promise<ChangeRecord> {
  const { state } = record;
  if (state.phase !== "acceptance" || state.kind === "epic") return record;
  const spec = parseSpec(record.spec, { language: there.lang }).spec;
  return {
    ...record,
    criteriaTests: await criteriaTests(there, spec, commits ?? new Map(), state.id),
  };
}

/**
 * The commit of every task of every change, by its trailers, in one look through the history of
 * every branch. `state.json` cannot keep it: it is the commit that holds the file.
 */
async function taskCommits(
  session: Session,
): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
  const result = await session.git.run([
    "log",
    "--all",
    "--grep=Specty-Task:",
    "--format=%h%x1f%(trailers:key=Specty-Change,valueonly,separator=%x2C)%x1f%(trailers:key=Specty-Task,valueonly,separator=%x2C)",
  ]);
  const commits = new Map<string, Map<string, string>>();
  if (result.code !== 0) return commits;
  const found = result.stdout.split("\n").flatMap((line) => {
    const [sha, change, task] = line.split("\x1f").map((part) => part.trim());
    return sha && change && task ? [{ sha, change, task }] : [];
  });
  // git lists the newest first: going backwards, a task keeps its latest commit.
  for (const { sha, change, task } of found.toReversed()) {
    commits.set(change, (commits.get(change) ?? new Map<string, string>()).set(task, sha));
  }
  return commits;
}

/** `record` with the commit of each task done. */
function withCommits(
  record: ChangeRecord,
  commits: ReadonlyMap<string, string> | undefined,
): ChangeRecord {
  if (commits === undefined) return record;
  const tasks = Object.fromEntries(
    Object.entries(record.state.tasks).map(([id, task]) => {
      const commit = commits.get(id);
      return [id, task.status === "done" && commit !== undefined ? { ...task, commit } : task];
    }),
  );
  return { ...record, state: { ...record.state, tasks } };
}

/**
 * An open change whose folder is gone, from its branch: its spec and state, with no folder. Its
 * phase began, as far as the page can tell, with the last commit of its branch.
 */
async function lostRecord(session: Session, lost: LostChange): Promise<ChangeRecord> {
  const tip = await session.git.run(["log", "-1", "--format=%cI", `refs/heads/${lost.branch}`]);
  const since = tip.stdout.trim();
  return {
    spec: lost.spec ?? `# ${lost.title}\n`,
    state: lost.state,
    phaseSince: tip.code === 0 && since !== "" ? since : session.environment.now().toISOString(),
    lost: true,
  };
}

/** A change's files; a change whose state cannot be read is left out. */
async function readRecord(
  files: ChangeFiles,
  folder: string,
  verifyFull: string | undefined,
): Promise<ChangeRecord | undefined> {
  const state = await loadState(files).catch(() => undefined);
  const spec = await readText(files.spec);
  if (state === undefined || spec === undefined) return undefined;
  const audit = auditLines(await readText(files.audit));
  const comments = parseJson(await readText(join(files.dir, "comments.json")));
  const approvedSpec = await readRevision(files, state.approved?.revision);
  const reviews = await reviewsOf(audit, files.dir);
  return {
    spec,
    state,
    phaseSince:
      enteredAt(audit, ENTERS[state.phase]) ?? (await stat(files.state)).mtime.toISOString(),
    folder,
    ...(Array.isArray(comments) ? { comments } : {}),
    ...(approvedSpec !== undefined ? { approvedSpec } : {}),
    ...(audit.length > 0 ? { audit } : {}),
    ...(verifyFull !== undefined ? { verifyFull } : {}),
    ...(reviews.length > 0 ? { reviews } : {}),
  };
}

/**
 * Each `review.completed` with an answer, and the answer's text. It is read by its name from the
 * change's own `reviews/` in `dir`: archiving moves the change, and nothing else is served.
 */
async function reviewsOf(
  audit: readonly Readonly<Record<string, unknown>>[],
  dir: string,
): Promise<ReviewRecord[]> {
  const reviews = await Promise.all(
    audit.map(async (entry): Promise<ReviewRecord | undefined> => {
      const data = isRecord(entry.data) ? entry.data : {};
      const { target, revision, file } = data;
      if (entry.event !== "review.completed" || typeof file !== "string") return undefined;
      if ((target !== "spec" && target !== "diff") || typeof revision !== "number")
        return undefined;
      const text = (await readText(join(dir, "reviews", basename(file))))?.trimEnd();
      return text === undefined || typeof entry.ts !== "string"
        ? undefined
        : { target, revision, at: entry.ts, text };
    }),
  );
  return reviews.flatMap((review) => (review === undefined ? [] : [review]));
}

function auditLines(text: string | undefined): Readonly<Record<string, unknown>>[] {
  return (text ?? "").split("\n").flatMap((line) => {
    const entry = parseJson(line);
    return isRecord(entry) ? [entry] : [];
  });
}

/** When the last of `events` happened. */
function enteredAt(
  audit: readonly Readonly<Record<string, unknown>>[],
  events: readonly string[],
): string | undefined {
  const entry = audit.findLast(
    (line) => typeof line.event === "string" && events.includes(line.event),
  );
  return typeof entry?.ts === "string" ? entry.ts : undefined;
}
