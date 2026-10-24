// SPDX-License-Identifier: Apache-2.0
// The verifications going on in other processes (`specty task done`), one file per change under
// git's common directory, so the local server of any worktree can show them live.
import { readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isRecord, parseJson, readText, writeText } from "../io/files";
import type { Git } from "../io/git";

/** A verification going on: its task, command, start, lines so far and the process running it. */
export interface LiveRun {
  readonly task: string;
  readonly command: string;
  readonly startedAt: string;
  readonly output: readonly string[];
  readonly pid: number;
}

const runPath = (git: Git, change: string) => git.gitPath(`common/specty/runs/${change}.json`);

export async function writeRun(git: Git, change: string, run: LiveRun): Promise<void> {
  await writeText(await runPath(git, change), JSON.stringify(run));
}

export async function clearRun(git: Git, change: string): Promise<void> {
  await rm(await runPath(git, change), { force: true });
}

/** Every run going on, by change; files that cannot be read are left out. */
export async function readRuns(git: Git): Promise<ReadonlyMap<string, LiveRun>> {
  const folder = dirname(await runPath(git, "_"));
  const names = await readdir(folder).catch(() => [] as string[]);
  const runs = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name): Promise<[string, LiveRun][]> => {
        const run = parseJson(await readText(join(folder, name)));
        return isLiveRun(run) ? [[name.slice(0, -".json".length), run]] : [];
      }),
  );
  return new Map(runs.flat());
}

function isLiveRun(value: unknown): value is LiveRun {
  return (
    isRecord(value) &&
    typeof value.task === "string" &&
    typeof value.command === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.pid === "number" &&
    Array.isArray(value.output) &&
    value.output.every((line) => typeof line === "string")
  );
}
