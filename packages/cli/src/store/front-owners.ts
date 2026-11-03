// SPDX-License-Identifier: Apache-2.0
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isRecord, parseJson, readText, remove, writeText } from "../io/files";
import type { Git } from "../io/git";
import { conversationStep } from "./activity";

/**
 * Who took a front of Specty's memory (formats.md §1, ADR 0016): the tool and the conversation
 * of the agent whose guard saw it run `specty front take`, and when. Under `common/`, git keeps it
 * in the common directory: every worktree sees it.
 */
interface FrontHold {
  readonly front: string;
  readonly tool: string;
  readonly conversation: string;
  /** ISO 8601, in UTC. */
  readonly at: string;
}

/** A hold that is still alive, with the minutes since its conversation stepped last. */
export type LiveHold = FrontHold & { readonly ago: number };

// Under `common/`, git keeps a path in the common directory, as `git rev-parse --git-path` says.
const FRONTS = "common/specty/fronts";

const MINUTE_MS = 60_000;

/**
 * `hold.conversation` holds `hold.front` from now on, and no other front: a conversation holds at
 * most one.
 */
export async function holdFront(git: Git, hold: FrontHold): Promise<void> {
  const folder = await git.gitPath(FRONTS);
  for (const known of await readHolds(folder)) {
    const same = known.tool === hold.tool && known.conversation === hold.conversation;
    if (same && known.front !== hold.front) await remove(join(folder, `${known.front}.json`));
  }
  const { front, tool, conversation, at } = hold;
  const text = JSON.stringify({ front, tool, conversation, at }, null, 2);
  await writeText(join(folder, `${front}.json`), `${text}\n`);
}

/** `front` has no owner from now on. */
export async function releaseFront(git: Git, front: string): Promise<void> {
  await remove(join(await git.gitPath(FRONTS), `${front}.json`));
}

/**
 * The holds whose conversation stepped last, or took its front, at most `limitMin` minutes
 * before `now` (`memory.orphanAfterMin`); an older one no longer holds its front.
 */
export async function liveHolds(git: Git, now: Date, limitMin: number): Promise<LiveHold[]> {
  const holds = await readHolds(await git.gitPath(FRONTS));
  const live = await Promise.all(
    holds.map(async (hold): Promise<LiveHold | undefined> => {
      const step = await conversationStep(git, hold.tool, hold.conversation);
      const last = Math.max(Date.parse(hold.at), step === undefined ? 0 : Date.parse(step.last));
      const since = now.getTime() - last;
      if (since > limitMin * MINUTE_MS) return undefined;
      return { ...hold, ago: Math.max(0, Math.floor(since / MINUTE_MS)) };
    }),
  );
  return live.flatMap((hold) => (hold === undefined ? [] : [hold]));
}

async function readHolds(folder: string): Promise<FrontHold[]> {
  const names = await readdir(folder).catch((): string[] => []);
  const read = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => holdOf(parseJson(await readText(join(folder, name))))),
  );
  return read.flatMap((hold) => (hold === undefined ? [] : [hold]));
}

function holdOf(value: unknown): FrontHold | undefined {
  if (!isRecord(value)) return undefined;
  const { front, tool, conversation, at } = value;
  if (typeof front !== "string" || typeof tool !== "string") return undefined;
  if (typeof conversation !== "string" || typeof at !== "string" || Number.isNaN(Date.parse(at)))
    return undefined;
  return { front, tool, conversation, at };
}
