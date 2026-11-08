// SPDX-License-Identifier: Apache-2.0

import { chmod } from "node:fs/promises";
import { appendLine, isRecord, parseJson, readText } from "../io/files";
import type { Git } from "../io/git";

/**
 * Specty's switch (docs/formats.md §1): a local, append-only log of each time the person turned
 * Specty off or on. Off, nothing the agent does goes through Specty (ARCHITECTURE §10).
 */

/** One change of state: the state it left, who and when. */
export interface SwitchEntry {
  readonly on: boolean;
  readonly by: string;
  readonly at: string;
}

// Under `common/`, git keeps a path in the common directory: one switch for every worktree.
const LOG = "common/specty/switch.jsonl";

/** The log's valid entries, the most recent first; a line of another shape does not count. */
export async function switchLog(git: Git): Promise<SwitchEntry[]> {
  const text = (await readText(await git.gitPath(LOG))) ?? "";
  return text
    .split("\n")
    .flatMap((line) => {
      const entry = entryOf(parseJson(line));
      return entry === undefined ? [] : [entry];
    })
    .reverse();
}

/** Specty's state now: the last valid entry, and on without any, so removing the log turns it on. */
export async function readSwitch(git: Git): Promise<SwitchEntry | { readonly on: true }> {
  return (await switchLog(git))[0] ?? { on: true };
}

/**
 * Adds `entry` to the log when it changes the state, and says whether it did. The log stays
 * read-only between changes, like the switch of delegated mode.
 */
export async function turnSwitch(git: Git, entry: SwitchEntry): Promise<boolean> {
  if ((await readSwitch(git)).on === entry.on) return false;
  const path = await git.gitPath(LOG);
  await chmod(path, 0o666).catch(() => undefined);
  const { on, by, at } = entry;
  await appendLine(path, JSON.stringify({ on, by, at }));
  await chmod(path, 0o444).catch(() => undefined);
  return true;
}

function entryOf(value: unknown): SwitchEntry | undefined {
  if (!isRecord(value)) return undefined;
  const { on, by, at } = value;
  return typeof on === "boolean" && typeof by === "string" && typeof at === "string"
    ? { on, by, at }
    : undefined;
}
