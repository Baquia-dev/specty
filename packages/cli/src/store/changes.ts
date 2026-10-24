// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { type ChangeKind, type ChangeState, parseChangeState } from "@baquia-dev/specty-core";
import { appendLine, exists, isMissing, parseJson, readText, writeText } from "../io/files";
import { type ChangeFiles, changeFiles, type RepoPaths } from "./paths";

export class StoreError extends Error {}

export interface StoredChange {
  readonly files: ChangeFiles;
  readonly state: ChangeState;
  readonly archived: boolean;
}

export interface AuditEntry {
  readonly ts: string;
  readonly actor: "agent" | "human" | "specty";
  readonly tool?: string;
  readonly event: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** The change's directory, open or archived. */
export async function locateChange(paths: RepoPaths, id: string): Promise<ChangeFiles | undefined> {
  const open = changeFiles(paths.changeDir(id));
  if (await exists(open.state)) return open;
  for (const year of await listDir(paths.archive)) {
    const archived = changeFiles(join(paths.archive, year, id));
    if (await exists(archived.state)) return archived;
  }
  return undefined;
}

export async function loadChange(paths: RepoPaths, id: string): Promise<StoredChange | undefined> {
  const files = await locateChange(paths, id);
  if (files === undefined) return undefined;
  return { files, state: await loadState(files), archived: files.dir.startsWith(paths.archive) };
}

export async function loadState(files: ChangeFiles): Promise<ChangeState> {
  const result = parseChangeState(parseJson(await readText(files.state)));
  if (!result.ok) throw new StoreError(`${files.state}: ${result.issues.join("; ")}`);
  return result.state;
}

export async function saveState(files: ChangeFiles, state: ChangeState): Promise<void> {
  await writeText(files.state, `${JSON.stringify(state, null, 2)}\n`);
}

export async function readSpec(files: ChangeFiles): Promise<string> {
  return (await readText(files.spec)) ?? "";
}

export async function appendAudit(files: ChangeFiles, entry: AuditEntry): Promise<void> {
  await appendLine(files.audit, JSON.stringify(entry));
}

export async function readRevision(
  files: ChangeFiles,
  number: number | undefined,
): Promise<string | undefined> {
  return number === undefined || number < 1 ? undefined : readText(files.revision(number));
}

/** Changes that are neither done nor cancelled. */
export async function listOpenChanges(paths: RepoPaths): Promise<StoredChange[]> {
  const ids = await listDir(paths.changes);
  const loaded = await Promise.all(ids.map((id) => loadChange(paths, id)));
  return loaded.filter(
    (change): change is StoredChange =>
      change !== undefined && change.state.phase !== "done" && change.state.phase !== "cancelled",
  );
}

export function initialState(input: {
  readonly id: string;
  readonly kind: ChangeKind;
  readonly branch?: string | undefined;
  readonly baseCommit?: string | undefined;
}): ChangeState {
  return {
    schema: 1,
    id: input.id,
    kind: input.kind,
    phase: "draft",
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.baseCommit !== undefined ? { baseCommit: input.baseCommit } : {}),
    revision: 0,
    items: {},
    tasks: {},
    pending: { scopeRequests: [], adjustment: null },
    maxIds: {},
  };
}

/** The folders inside `path`, sorted; none when it does not exist. */
export async function listDir(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}
