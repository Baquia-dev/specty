// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ChangeState, Phase } from "@baquia-dev/specty-core";
import { isFinished } from "../flow/active";
import { locateChanges } from "../flow/changes";
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
  /** The worktree whose files these are. */
  readonly folder: string;
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
  implementing: ["spec.approved"],
  adjusting: ["adjust.requested"],
  acceptance: ["task.completed", "spec.approved"],
  closing: ["change.accepted"],
  done: ["change.closed", "change.accepted", "retro.confirmed"],
  cancelled: ["change.cancelled"],
};

/**
 * Every change of the repository, once: the open change of each worktree (and this folder's
 * without a branch of their own), then the archived ones of each worktree, the main folder first,
 * so a closed change that did not reach the main branch still shows from its own worktree.
 */
export async function changeRecords(session: Session): Promise<ChangeRecord[]> {
  const records: ChangeRecord[] = [];
  const add = (record: ChangeRecord | undefined) => {
    if (record !== undefined && !records.some((seen) => seen.state.id === record.state.id))
      records.push(record);
  };
  for (const { change, session: there } of await locateChanges(session)) {
    if (!isFinished(change.state))
      add(await readRecord(change.files, there.root, there.config.verify.full));
  }
  for (const { folder } of await session.git.worktrees()) {
    const { archive } = repoPaths(folder);
    for (const year of await listDir(archive)) {
      for (const id of await listDir(join(archive, year))) {
        if (!records.some((seen) => seen.state.id === id))
          add(await readRecord(changeFiles(join(archive, year, id)), folder, undefined));
      }
    }
  }
  const commits = await taskCommits(session);
  return records.map((record) => withCommits(record, commits.get(record.state.id)));
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
