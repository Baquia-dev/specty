// SPDX-License-Identifier: Apache-2.0
import { stat } from "node:fs/promises";
import { join } from "node:path";
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
}

/** The audit events that move a change into each phase: the last one says since when it is there. */
const ENTERS: Readonly<Record<Phase, readonly string[]>> = {
  draft: ["change.created"],
  review: ["spec.proposed"],
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
  return records;
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
  };
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
