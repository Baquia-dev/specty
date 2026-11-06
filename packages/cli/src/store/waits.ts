// SPDX-License-Identifier: Apache-2.0
import { stat, utimes } from "node:fs/promises";
import { type AgentTool, isAgentTool } from "@baquia-dev/specty-core";
import { isRecord, parseJson, readText, writeText } from "../io/files";
import type { Git } from "../io/git";
import { alive } from "./lock";

/**
 * The mark of a `specty wait` that waits for the person (formats.md §1): one file per change,
 * shared by every worktree, so the end of the agent's turn and the UI know whether a `wait` is
 * alive, or when and why the last one ended. The last `wait` that wrote it counts.
 */
const markOf = (id: string) => `common/specty/waits/${id}.json`;

/** A `wait` renews its mark at each look; one this long without it, or three looks, was cut off. */
const STALE_MS = 30_000;

/** The `wait` that waits for the person's decision on a change. */
export interface WaitHolder {
  readonly pid: number;
  /** The agent's tool, when Specty knows it. */
  readonly tool?: AgentTool;
  /** When it started, in ISO 8601 and UTC. */
  readonly since: string;
  readonly intervalMs: number;
  readonly timeoutSec: number;
}

/** Why a `wait` ended: the person decided, its time ran out, or it was cut off. */
type WaitReason = "decided" | "timeout" | "stopped";

/** The last mark of a change: alive without `ended`, or when and why its `wait` ended. */
export interface WaitSeen extends WaitHolder {
  readonly ended?: { readonly at: string; readonly reason: WaitReason };
}

/** The mark this process wrote. */
export interface WaitMark {
  /** Renews the time of its file, as each look of `wait` does. */
  renew(): Promise<void>;
  /** Ends it with `reason`, unless another `wait` wrote its own mark since. */
  end(reason: "decided" | "timeout"): Promise<void>;
}

/** Writes the mark of `holder`, the `wait` that waits for the person's decision on change `id`. */
export async function markWait(git: Git, id: string, holder: WaitHolder): Promise<WaitMark> {
  const path = await git.gitPath(markOf(id));
  await writeText(path, serialized(holder));
  return {
    async renew() {
      const now = new Date();
      await utimes(path, now, now).catch(() => undefined);
    },
    async end(reason) {
      const current = await readMark(path);
      if (current?.pid !== holder.pid || current.since !== holder.since) return;
      const ended = { at: new Date().toISOString(), reason };
      await writeText(path, serialized({ ...holder, ended }));
    },
  };
}

/**
 * The last mark of change `id` at `now`, on the real clock: alive, ended with its reason, or cut
 * off (`stopped`) at its file's time when its process no longer exists or it went stale.
 */
export async function readWait(git: Git, id: string, now: Date): Promise<WaitSeen | undefined> {
  const path = await git.gitPath(markOf(id));
  const [mark, info] = await Promise.all([readMark(path), stat(path).catch(() => undefined)]);
  if (mark === undefined || info === undefined || mark.ended !== undefined) return mark;
  const fresh = now.getTime() - info.mtimeMs <= Math.max(STALE_MS, 3 * mark.intervalMs);
  if (fresh && alive(mark.pid)) return mark;
  return { ...mark, ended: { at: info.mtime.toISOString(), reason: "stopped" } };
}

const serialized = (mark: WaitSeen) => `${JSON.stringify(mark, null, 2)}\n`;

async function readMark(path: string): Promise<WaitSeen | undefined> {
  const value = parseJson(await readText(path));
  if (!isRecord(value)) return undefined;
  const holder = holderOf(value);
  if (holder === undefined) return undefined;
  const ended = endedOf(value.ended);
  return ended === undefined ? holder : { ...holder, ended };
}

function holderOf(value: Readonly<Record<string, unknown>>): WaitHolder | undefined {
  const { pid, tool, since, intervalMs, timeoutSec } = value;
  if (typeof pid !== "number" || typeof since !== "string") return undefined;
  if (typeof intervalMs !== "number" || typeof timeoutSec !== "number") return undefined;
  const known = typeof tool === "string" && isAgentTool(tool) ? { tool } : {};
  return { pid, ...known, since, intervalMs, timeoutSec };
}

const REASONS: readonly string[] = ["decided", "timeout", "stopped"] satisfies WaitReason[];

function endedOf(value: unknown): WaitSeen["ended"] {
  if (!isRecord(value) || typeof value.at !== "string") return undefined;
  const { at, reason } = value;
  return isReason(reason) ? { at, reason } : undefined;
}

const isReason = (value: unknown): value is WaitReason =>
  typeof value === "string" && REASONS.includes(value);
