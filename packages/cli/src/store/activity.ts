// SPDX-License-Identifier: Apache-2.0
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isRecord, parseJson, readText, writeText } from "../io/files";
import type { Git } from "../io/git";

/**
 * What each agent conversation did last (formats.md §1, ADR 0016): the folder it works in and
 * when it stepped first and last. The guard writes it and `status` reads it, to tell who holds
 * each change. Under `common/`, git keeps it in the common directory: every worktree sees it.
 */
export interface Activity {
  readonly tool: string;
  /** Absolute path of the folder of its last step. */
  readonly folder: string;
  /** ISO 8601, in UTC: its first step, in any folder. */
  readonly first: string;
  /** ISO 8601, in UTC: its last step noted, at most a minute old while it keeps working. */
  readonly last: string;
}

// Under `common/`, git keeps a path in the common directory, as `git rev-parse --git-path` says.
const ACTIVITY = "common/specty/activity";

/** A conversation that stays in the same folder is written again at most once a minute. */
const REWRITE_MS = 60_000;

/** A step of `conversation` of `tool` in `folder`, noted unless one there was in the last minute. */
export async function noteActivity(
  git: Git,
  step: {
    readonly tool: string;
    readonly conversation: string;
    readonly folder: string;
    readonly now: Date;
  },
): Promise<void> {
  const path = join(await activityFolder(git), `${step.tool}-${step.conversation}.json`);
  const known = activityOf(parseJson(await readText(path)));
  const recent =
    known !== undefined &&
    known.folder === step.folder &&
    step.now.getTime() - Date.parse(known.last) < REWRITE_MS;
  if (recent) return;
  const at = step.now.toISOString();
  const noted: Activity = {
    tool: step.tool,
    folder: step.folder,
    first: known?.first ?? at,
    last: at,
  };
  await writeText(path, `${JSON.stringify(noted, null, 2)}\n`);
}

/** Every conversation's activity, also of those that ended. */
export async function readActivity(git: Git): Promise<Activity[]> {
  const folder = await activityFolder(git);
  const names = await readdir(folder).catch((): string[] => []);
  const read = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => activityOf(parseJson(await readText(join(folder, name))))),
  );
  return read.flatMap((activity) => (activity === undefined ? [] : [activity]));
}

/**
 * The activity's folder. The guard notes a step on every event, so it reads the common directory
 * from `.git` instead of running git; git says where it is only when `.git` does not tell.
 */
async function activityFolder(git: Git): Promise<string> {
  const common = await commonDir(git.root).catch(() => undefined);
  return common === undefined ? git.gitPath(ACTIVITY) : join(common, ACTIVITY);
}

/** `.git` itself, or the common directory of the worktree whose `.git` file points elsewhere. */
async function commonDir(root: string): Promise<string | undefined> {
  const dotGit = join(root, ".git");
  if ((await stat(dotGit)).isDirectory()) return dotGit;
  const pointer = /^gitdir: (.+)$/m.exec((await readText(dotGit)) ?? "")?.[1]?.trim();
  if (pointer === undefined) return undefined;
  const gitDir = resolve(root, pointer);
  const common = (await readText(join(gitDir, "commondir")))?.trim();
  return common === undefined ? gitDir : resolve(gitDir, common);
}

function activityOf(value: unknown): Activity | undefined {
  if (!isRecord(value)) return undefined;
  const { tool, folder, first, last } = value;
  if (typeof tool !== "string" || typeof folder !== "string") return undefined;
  if (typeof first !== "string" || typeof last !== "string" || Number.isNaN(Date.parse(last)))
    return undefined;
  return { tool, folder, first, last };
}
