// SPDX-License-Identifier: Apache-2.0
import {
  type Lang,
  type MemoryEntry,
  type MemoryOperation,
  memoryCommitSubject,
  memoryReadme,
  parseEntry,
  parseEntryId,
  serializeEntry,
} from "@baquia-dev/specty-core";
import type { Git } from "../io/git";

/**
 * Specty's memory (formats.md §1, ADR 0016): the entries of a branch of its own that no folder
 * checks out. Specty reads it and writes it with git's plumbing, so every worktree of the clone
 * sees an entry as soon as it is written, and none of them changes.
 */

/** The memory as its branch has it: the entries it can read, and the id of every file. */
export interface Memory {
  readonly entries: readonly MemoryEntry[];
  /** Also those of entries it cannot read, which still count for the next id. */
  readonly ids: readonly string[];
}

/** One entry to write, added or changed, and what the commit says it did. */
export interface MemoryWrite {
  readonly entry: MemoryEntry;
  readonly operation: MemoryOperation;
}

/** Where the memory lives and what its commits say besides the entry. */
export interface MemoryTarget {
  readonly branch: string;
  /** The README's language and the commits'. */
  readonly lang: Lang;
  /** `Specty-Change` and `Specty-Agent`, when they apply; `Specty-Memory` goes on its own. */
  readonly trailers: Readonly<Record<string, string>>;
}

/** The memory's tip, its readable entries and the blob of each file of `entries/`. */
interface Snapshot extends Memory {
  readonly tip?: string;
  readonly blobs: ReadonlyMap<string, string>;
}

/** Another session that wrote first makes `update-ref` fail: read again and retry. */
const ATTEMPTS = 10;

const ENTRY_FILE = /^entries\/([^/]+)\.md$/;

/** The memory of `branch`: empty before the branch exists. */
export async function readMemory(git: Git, branch: string): Promise<Memory> {
  const { entries, ids } = await snapshot(git, branch);
  return { entries, ids };
}

/**
 * Applies `edit` to the memory as it is, and commits the entry it returns, if any. When another
 * session wrote first, it applies `edit` again to what that session left: nothing is lost.
 */
export async function editMemory<T>(
  git: Git,
  target: MemoryTarget,
  edit: (memory: Memory) => { readonly write?: MemoryWrite; readonly result: T },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const before = await snapshot(git, target.branch);
    const { write, result } = edit(before);
    if (write === undefined || (await commitWrite(git, target, before, write))) return result;
    if (attempt >= ATTEMPTS) throw new Error(`${target.branch}: other sessions kept writing it`);
  }
}

async function snapshot(git: Git, branch: string): Promise<Snapshot> {
  const tip = (
    await git.run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`])
  ).stdout.trim();
  if (tip.length === 0) return { entries: [], ids: [], blobs: new Map() };
  const files = (await git.output(["ls-tree", "-r", "-z", tip, "--", "entries/"]))
    .split("\0")
    .flatMap((line) => {
      // `<mode> blob <sha>\t<path>`
      const [meta, path] = line.split("\t");
      const sha = meta?.split(" ")[2];
      const id = parseEntryId(ENTRY_FILE.exec(path ?? "")?.[1] ?? "");
      return sha === undefined || id === undefined ? [] : [{ id, sha }];
    });
  const contents = await blobContents(
    git,
    files.map((file) => file.sha),
  );
  const entries = contents.flatMap((content) => {
    const entry = parseEntry(content);
    return entry === undefined ? [] : [entry];
  });
  return {
    tip,
    entries,
    ids: files.map((file) => file.id),
    blobs: new Map(files.map((file) => [file.id, file.sha])),
  };
}

/**
 * Every blob in one `cat-file --batch`: `<sha> blob <size>\n<content>\n` each, with the size in
 * bytes, in the order asked.
 */
async function blobContents(git: Git, shas: readonly string[]): Promise<string[]> {
  if (shas.length === 0) return [];
  const result = await git.run(["cat-file", "--batch"], { input: `${shas.join("\n")}\n` });
  const bytes = Buffer.from(result.stdout, "utf8");
  const contents: string[] = [];
  let at = 0;
  while (at < bytes.length) {
    const end = bytes.indexOf(0x0a, at);
    if (end < 0) break;
    const size = Number(bytes.toString("utf8", at, end).split(" ")[2]);
    const start = end + 1;
    // A missing object has no size and no content.
    contents.push(Number.isInteger(size) ? bytes.toString("utf8", start, start + size) : "");
    at = Number.isInteger(size) ? start + size + 1 : start;
  }
  return contents;
}

/** Commits `write` on top of `before`: false when another session moved the branch first. */
async function commitWrite(
  git: Git,
  target: MemoryTarget,
  before: Snapshot,
  write: MemoryWrite,
): Promise<boolean> {
  const { entry } = write;
  const blobs = new Map(before.blobs).set(entry.id, await hashed(git, serializeEntry(entry)));
  const entries = [...before.entries.filter((known) => known.id !== entry.id), entry];
  const readme = await hashed(git, memoryReadme(entries, target.lang));
  const folder = await tree(
    git,
    [...blobs].map(([id, sha]) => `100644 blob ${sha}\t${id}.md`),
  );
  const root = await tree(git, [
    `100644 blob ${readme}\tREADME.md`,
    `040000 tree ${folder}\tentries`,
  ]);
  const trailers = { "Specty-Memory": entry.id, ...target.trailers };
  const message = `${memoryCommitSubject(write.operation, entry.id, target.lang)}\n\n${Object.entries(
    trailers,
  )
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")}\n`;
  const parent = before.tip === undefined ? [] : ["-p", before.tip];
  const commit = await git.output(["commit-tree", root, ...parent], { input: message });
  // The old value makes the update fail if the branch moved; empty, if it came to exist.
  const updated = await git.run([
    "update-ref",
    `refs/heads/${target.branch}`,
    commit,
    before.tip ?? "",
  ]);
  return updated.code === 0;
}

async function hashed(git: Git, content: string): Promise<string> {
  return git.output(["hash-object", "-w", "--stdin"], { input: content });
}

async function tree(git: Git, lines: readonly string[]): Promise<string> {
  return git.output(["mktree"], { input: `${lines.join("\n")}\n` });
}
