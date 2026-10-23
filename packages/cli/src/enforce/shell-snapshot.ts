// SPDX-License-Identifier: Apache-2.0
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type ChangedFile, DELETED, type ShellSnapshot } from "@baquia-dev/specty-core";
import { isMissing, isRecord, parseJson, readText, remove, writeText } from "../io/files";
import type { Session } from "../session";

/**
 * Snapshots of the working tree taken before each Bash command of the agent, so the guard can
 * tell afterwards what the command changed (docs/formats.md §1). One file per tool call, under
 * the git directory: `specty/shell/<tool_use_id>.json`.
 */

/** The snapshot of a command whose second hook never ran (blocked, interrupted) expires. */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

/** Every file that differs from `HEAD`, with its size and modification time, or `DELETED`. */
export async function treeSnapshot(session: Session): Promise<ShellSnapshot> {
  const changed = await session.git.changedSince(await session.git.head());
  const entries = await Promise.all(changed.flatMap((file) => entriesOf(session.root, file)));
  return Object.fromEntries(entries);
}

export async function saveSnapshot(
  session: Session,
  id: string,
  snapshot: ShellSnapshot,
): Promise<void> {
  await writeText(join(await directoryOf(session), `${id}.json`), JSON.stringify(snapshot));
}

/** The snapshot taken before tool call `id`, removed as it is read; undefined without one. */
export async function takeSnapshot(
  session: Session,
  id: string,
): Promise<ShellSnapshot | undefined> {
  const path = join(await directoryOf(session), `${id}.json`);
  const text = await readText(path);
  if (text === undefined) return undefined;
  await remove(path);
  const value = parseJson(text);
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** Removes the snapshots of commands that never reported back. */
export async function pruneSnapshots(session: Session): Promise<void> {
  const directory = await directoryOf(session);
  const limit = session.environment.now().getTime() - SNAPSHOT_TTL_MS;
  for (const name of await namesIn(directory)) {
    const path = join(directory, name);
    const modified = await modifiedAt(path);
    if (modified !== undefined && modified < limit) await remove(path);
  }
}

function directoryOf(session: Session): Promise<string> {
  return session.git.gitPath("specty/shell");
}

function entriesOf(root: string, file: ChangedFile): Promise<[string, string]>[] {
  const moved =
    file.from === undefined ? [] : [Promise.resolve<[string, string]>([file.from, DELETED])];
  return [...moved, fingerprint(root, file)];
}

async function fingerprint(root: string, file: ChangedFile): Promise<[string, string]> {
  if (file.status === "deleted") return [file.path, DELETED];
  const info = await modifiedAndSize(join(root, file.path));
  return [file.path, info === undefined ? DELETED : `${info.size}:${info.modified}`];
}

async function modifiedAndSize(
  path: string,
): Promise<{ readonly size: number; readonly modified: number } | undefined> {
  try {
    const info = await stat(path);
    return { size: info.size, modified: info.mtimeMs };
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function modifiedAt(path: string): Promise<number | undefined> {
  return (await modifiedAndSize(path))?.modified;
}

async function namesIn(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}
