// SPDX-License-Identifier: Apache-2.0
// What `specty task done` checks of the approved tests a person unlocked for a task (ADR 0014):
// each one is as the patch of its last approved unlock leaves its locked version.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashText, type UnlockMismatch } from "@baquia-dev/specty-core";
import { readText } from "../io/files";
import type { Session } from "../session";
import type { StoredChange } from "../store/changes";
import { type Audit, dataOf, readAudit } from "./carried";

/** The last approved unlock of some of a task's tests, with the patch they end as. */
interface PatchedUnlock {
  readonly request: string;
  /** The tests still locked whose last approved unlock this is. */
  readonly paths: readonly string[];
  readonly patch: string;
}

/** An approved unlock of a task, as `scope.decided` keeps it: an older CLI kept no patch. */
interface ApprovedUnlock {
  readonly request: string;
  readonly paths: readonly string[];
  readonly patch: string | undefined;
}

/** What a patch leaves of each of its tests: its text, or undefined when it deletes it. */
type Patched = ReadonlyMap<string, string | undefined>;

/** Each test unlocked for `task` that is not as its approved patch leaves it; none when all are. */
export async function unlockMismatches(
  session: Session,
  change: StoredChange,
  task: string,
): Promise<readonly UnlockMismatch[]> {
  const locked = change.state.lockedTests ?? {};
  const unlocks = lastUnlocks(await readAudit(change.files), task, locked);
  if (unlocks.length === 0) return [];
  const folder = await mkdtemp(join(tmpdir(), "specty-unlock-"));
  try {
    const found: UnlockMismatch[] = [];
    for (const unlock of unlocks)
      found.push(...(await mismatchesOf(session, folder, unlock, locked)));
    return found;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/**
 * The unlocks that count for `task`, approved since it last started: of each locked test, the
 * last one. Each patch was checked against the locked version, so a later one replaces the
 * earlier ones; one without a patch leaves its tests unchecked.
 */
function lastUnlocks(
  audit: Audit,
  task: string,
  locked: Readonly<Record<string, string>>,
): readonly PatchedUnlock[] {
  const started = audit.findLastIndex(
    (entry) => entry.event === "task.started" && dataOf(entry).task === task,
  );
  const approved = audit.slice(started + 1).flatMap((entry) => approvedUnlock(entry, task));
  const last = new Map(approved.flatMap((unlock) => unlock.paths.map((path) => [path, unlock])));
  return approved.flatMap(({ request, paths, patch }) => {
    const counted = paths.filter(
      (path) => last.get(path)?.request === request && Object.hasOwn(locked, path),
    );
    return patch === undefined || counted.length === 0 ? [] : [{ request, paths: counted, patch }];
  });
}

/** The unlock `entry` approves for `task`, if it is one. */
function approvedUnlock(entry: Record<string, unknown>, task: string): ApprovedUnlock[] {
  if (entry.event !== "scope.decided") return [];
  const { id, decision, unlock, patch, task: of } = dataOf(entry);
  if (decision !== "approved" || of !== task) return [];
  if (typeof id !== "string" || !Array.isArray(unlock)) return [];
  const paths = unlock.filter((path): path is string => typeof path === "string");
  return [{ request: id, paths, patch: typeof patch === "string" ? patch : undefined }];
}

/** How each test of `unlock` differs from what its patch leaves of its locked version. */
async function mismatchesOf(
  session: Session,
  folder: string,
  unlock: PatchedUnlock,
  locked: Readonly<Record<string, string>>,
): Promise<UnlockMismatch[]> {
  const { request, paths } = unlock;
  const moved = await Promise.all(paths.map((path) => lockedInHead(session, path, locked)));
  const unverified = paths.filter((_, index) => !moved[index]);
  if (unverified.length > 0) {
    return unverified.map((path) => ({ kind: "unverifiable", path, request }));
  }
  const patched = await applied(session, folder, unlock);
  if ("detail" in patched) {
    return paths.map((path) => ({ kind: "unverifiable", path, request, detail: patched.detail }));
  }
  const found: UnlockMismatch[] = [];
  for (const path of paths) {
    const mismatch = await compared(session, folder, request, path, patched.texts.get(path));
    if (mismatch !== undefined) found.push(mismatch);
  }
  return found;
}

/** Whether the last commit has `path` as it was locked, the version its patch applies to. */
async function lockedInHead(
  session: Session,
  path: string,
  locked: Readonly<Record<string, string>>,
): Promise<boolean> {
  const shown = await session.git.run(["--literal-pathspecs", "show", `HEAD:${path}`]);
  return shown.code === 0 && hashText(shown.stdout) === locked[path];
}

/**
 * What `unlock`'s patch leaves of its tests, applied as `scope add` checked it (`--recount`) to
 * the last commit's tree in an index of its own: neither the folder nor its index change.
 */
async function applied(
  session: Session,
  folder: string,
  unlock: PatchedUnlock,
): Promise<{ readonly texts: Patched } | { readonly detail: string }> {
  const env = { GIT_INDEX_FILE: join(folder, "index") };
  const { git } = session;
  await git.output(["read-tree", "HEAD"], { env });
  const apply = await git.run(["apply", "--cached", "--recount", "-"], {
    env,
    input: unlock.patch,
  });
  if (apply.code !== 0) return { detail: apply.stderr.trim().split("\n")[0] ?? "" };
  const texts = await Promise.all(
    unlock.paths.map(async (path) => {
      const shown = await git.run(["--literal-pathspecs", "show", `:${path}`], { env });
      return [path, shown.code === 0 ? shown.stdout : undefined] as const;
    }),
  );
  return { texts: new Map(texts) };
}

/** How the test at `path` differs from `expected`, what its patch leaves; undefined if it does not. */
async function compared(
  session: Session,
  folder: string,
  request: string,
  path: string,
  expected: string | undefined,
): Promise<UnlockMismatch | undefined> {
  const actual = await readText(join(session.root, path));
  if (actual === expected) return undefined;
  if (expected === undefined) return { kind: "kept", path, request };
  if (actual === undefined) return { kind: "missing", path, request };
  return {
    kind: "different",
    path,
    request,
    diff: await difference(session, folder, expected, path),
  };
}

/** The diff from `expected` to the test at `path`, from its first hunk on. */
async function difference(
  session: Session,
  folder: string,
  expected: string,
  path: string,
): Promise<readonly string[]> {
  const file = join(folder, "expected");
  await writeFile(file, expected);
  const diff = await session.git.run([
    "diff",
    "--no-index",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--",
    file,
    path,
  ]);
  const lines = diff.stdout.replace(/\n$/, "").split("\n");
  const hunk = lines.findIndex((line) => line.startsWith("@@"));
  return hunk < 0 ? [] : lines.slice(hunk);
}
