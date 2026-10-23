// SPDX-License-Identifier: Apache-2.0

import { isRecord, parseJson, readText, remove, writeText } from "../io/files";
import type { Git } from "../io/git";

/**
 * Local, never-versioned state under the git directory (docs/formats.md §1): commit
 * receipts, markers between hooks and pointers to the change in progress.
 */

/** `init` is Specty's own installation: its commit belongs to no change. */
const RECEIPT_KINDS = ["spec", "task", "close", "retro", "init"] as const;

export type ReceiptKind = (typeof RECEIPT_KINDS)[number];

export interface Receipt {
  readonly tree: string;
  readonly change: string;
  readonly kind: ReceiptKind;
  readonly task?: string;
  readonly createdAt: string;
}

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

export async function addReceipt(git: Git, receipt: Receipt): Promise<void> {
  const receipts = await readReceipts(git);
  await writeReceipts(git, [...receipts.filter((entry) => entry.tree !== receipt.tree), receipt]);
}

/** Removes and returns the receipt for `tree`, dropping expired ones on the way. */
export async function takeReceipt(git: Git, tree: string, now: Date): Promise<Receipt | undefined> {
  const fresh = (await readReceipts(git)).filter(
    (entry) => now.getTime() - Date.parse(entry.createdAt) < RECEIPT_TTL_MS,
  );
  const match = fresh.find((entry) => entry.tree === tree);
  await writeReceipts(
    git,
    fresh.filter((entry) => entry !== match),
  );
  return match;
}

/** A marker passes information from `pre-commit` to `prepare-commit-msg`. */
export interface CommitMarker {
  readonly tree: string;
  readonly change: string;
  readonly kind: ReceiptKind | "manual";
}

export async function writeMarker(git: Git, marker: CommitMarker): Promise<void> {
  await writeText(await git.gitPath("specty/commit-marker.json"), JSON.stringify(marker));
}

export async function takeMarker(git: Git): Promise<CommitMarker | undefined> {
  const path = await git.gitPath("specty/commit-marker.json");
  const value = parseJson(await readText(path));
  await remove(path);
  if (!isRecord(value)) return undefined;
  const { tree, change, kind } = value;
  if (typeof tree !== "string" || typeof change !== "string" || typeof kind !== "string")
    return undefined;
  const known = [...RECEIPT_KINDS, "manual"] as const;
  const markerKind = known.find((candidate) => candidate === kind);
  return markerKind === undefined ? undefined : { tree, change, kind: markerKind };
}

export type Pointer = "retro" | "active";

/** The retro in progress, or the active change when branches are not used. */
export async function readPointer(git: Git, pointer: Pointer): Promise<string | undefined> {
  const value = (await readText(await git.gitPath(`specty/${pointer}`)))?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export async function writePointer(
  git: Git,
  pointer: Pointer,
  id: string | undefined,
): Promise<void> {
  const path = await git.gitPath(`specty/${pointer}`);
  if (id === undefined) await remove(path);
  else await writeText(path, `${id}\n`);
}

/** The person delegated their decisions to the agent (ADR 0010): who did it and when. */
export interface Delegation {
  readonly by: string;
  readonly at: string;
}

// Under `common/`, git keeps a path in the common directory: one switch for every worktree.
const DELEGATION = "common/specty/delegated.json";

export async function readDelegation(git: Git): Promise<Delegation | undefined> {
  const value = parseJson(await readText(await git.gitPath(DELEGATION)));
  if (!isRecord(value)) return undefined;
  const { by, at } = value;
  return typeof by === "string" && typeof at === "string" ? { by, at } : undefined;
}

export async function writeDelegation(git: Git, delegation: Delegation): Promise<void> {
  await writeText(await git.gitPath(DELEGATION), `${JSON.stringify(delegation, null, 2)}\n`);
}

export async function clearDelegation(git: Git): Promise<void> {
  await remove(await git.gitPath(DELEGATION));
}

async function readReceipts(git: Git): Promise<Receipt[]> {
  const value = parseJson(await readText(await git.gitPath("specty/receipts.json")));
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown): Receipt[] => {
    if (!isRecord(entry)) return [];
    const { tree, change, kind, task, createdAt } = entry;
    const receiptKind = RECEIPT_KINDS.find((candidate) => candidate === kind);
    if (typeof tree !== "string" || typeof change !== "string" || typeof createdAt !== "string")
      return [];
    if (receiptKind === undefined) return [];
    return [
      { tree, change, kind: receiptKind, createdAt, ...(typeof task === "string" ? { task } : {}) },
    ];
  });
}

async function writeReceipts(git: Git, receipts: readonly Receipt[]): Promise<void> {
  await writeText(
    await git.gitPath("specty/receipts.json"),
    `${JSON.stringify(receipts, null, 2)}\n`,
  );
}
