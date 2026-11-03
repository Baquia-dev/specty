// SPDX-License-Identifier: Apache-2.0
import {
  type Front,
  type Lang,
  type MemoryEntry,
  type MemoryOperation,
  memoryCommitSubject,
  memoryReadme,
  parseEntry,
  parseEntryId,
  parseFront,
  serializeEntry,
  serializeFront,
} from "@baquia-dev/specty-core";
import type { Git } from "../io/git";

/**
 * Specty's memory (formats.md §1, ADR 0016): the entries and the fronts of a branch of its own
 * that no folder checks out. Specty reads it and writes it with git's plumbing, so every worktree of the clone
 * sees an entry as soon as it is written, and none of them changes.
 */

/** The memory as its branch has it: the entries and fronts it can read, and every entry's id. */
export interface Memory {
  readonly entries: readonly MemoryEntry[];
  /** Also those of entries it cannot read, which still count for the next id. */
  readonly ids: readonly string[];
  readonly fronts: readonly Front[];
}

/**
 * What one commit writes: an entry, added or changed, and what the commit says it did; or the
 * fronts it adds or changes, the one the commit is about and its subject.
 */
export type MemoryWrite =
  | { readonly entry: MemoryEntry; readonly operation: MemoryOperation }
  | { readonly fronts: readonly Front[]; readonly front: string; readonly subject: string };

/** Where the memory lives and what its commits say besides the entry. */
export interface MemoryTarget {
  readonly branch: string;
  /** The README's language and the commits'. */
  readonly lang: Lang;
  /** `Specty-Change` and `Specty-Agent`, when they apply; `Specty-Memory` goes on its own. */
  readonly trailers: Readonly<Record<string, string>>;
}

/** The memory's tip, what it can read, and the blob of each file of `entries/` and `fronts/`. */
interface Snapshot extends Memory {
  readonly tip?: string;
  readonly blobs: ReadonlyMap<string, string>;
  /** By the front's name, as its file says. */
  readonly frontBlobs: ReadonlyMap<string, string>;
}

/** Another session that wrote first makes `update-ref` fail: read again and retry. */
const ATTEMPTS = 10;

const ENTRY_FILE = /^entries\/([^/]+)\.md$/;
const FRONT_FILE = /^fronts\/([^/]+)\.md$/;

/** The memory of `branch`: empty before the branch exists. */
export async function readMemory(git: Git, branch: string): Promise<Memory> {
  const { entries, ids, fronts } = await snapshot(git, branch);
  return { entries, ids, fronts };
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
  if (tip.length === 0)
    return { entries: [], ids: [], fronts: [], blobs: new Map(), frontBlobs: new Map() };
  const files = await treeFiles(git, tip);
  const entryFiles = files.flatMap(({ path, sha }) => {
    const id = parseEntryId(ENTRY_FILE.exec(path)?.[1] ?? "");
    return id === undefined ? [] : [{ id, sha }];
  });
  const frontFiles = files.flatMap(({ path, sha }) => {
    const name = FRONT_FILE.exec(path)?.[1];
    return name === undefined ? [] : [{ name, sha }];
  });
  const contents = await blobContents(
    git,
    [...entryFiles, ...frontFiles].map((file) => file.sha),
  );
  return {
    tip,
    entries: readable(contents.slice(0, entryFiles.length), parseEntry),
    ids: entryFiles.map((file) => file.id),
    fronts: readable(contents.slice(entryFiles.length), parseFront),
    blobs: new Map(entryFiles.map((file) => [file.id, file.sha])),
    frontBlobs: new Map(frontFiles.map((file) => [file.name, file.sha])),
  };
}

/** The files of `entries/` and `fronts/` at `tip`, each with its blob. */
async function treeFiles(git: Git, tip: string): Promise<{ path: string; sha: string }[]> {
  const listed = await git.output(["ls-tree", "-r", "-z", tip, "--", "entries/", "fronts/"]);
  return listed.split("\0").flatMap((line) => {
    // `<mode> blob <sha>\t<path>`
    const [meta, path] = line.split("\t");
    const sha = meta?.split(" ")[2];
    return sha === undefined || path === undefined ? [] : [{ path, sha }];
  });
}

/** What `parse` reads in each of `contents`, without those it cannot. */
function readable<T>(contents: readonly string[], parse: (content: string) => T | undefined): T[] {
  return contents.flatMap((content) => {
    const parsed = parse(content);
    return parsed === undefined ? [] : [parsed];
  });
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
  const root = await rootTree(git, target, before, write);
  const parent = before.tip === undefined ? [] : ["-p", before.tip];
  const commit = await git.output(["commit-tree", root, ...parent], {
    input: messageOf(target, write),
  });
  // The old value makes the update fail if the branch moved; empty, if it came to exist.
  const updated = await git.run([
    "update-ref",
    `refs/heads/${target.branch}`,
    commit,
    before.tip ?? "",
  ]);
  return updated.code === 0;
}

/** The tree of the memory after `write`: the README, `entries/` and, with any, `fronts/`. */
async function rootTree(
  git: Git,
  target: MemoryTarget,
  before: Snapshot,
  write: MemoryWrite,
): Promise<string> {
  const blobs = new Map(before.blobs);
  const frontBlobs = new Map(before.frontBlobs);
  if ("entry" in write) blobs.set(write.entry.id, await hashed(git, serializeEntry(write.entry)));
  else
    for (const front of write.fronts)
      frontBlobs.set(front.name, await hashed(git, serializeFront(front)));
  const entries =
    "entry" in write
      ? [...before.entries.filter((known) => known.id !== write.entry.id), write.entry]
      : before.entries;
  const readme = await hashed(git, memoryReadme(entries, target.lang));
  const folders = [
    ["entries", blobs],
    ["fronts", frontBlobs],
  ] as const;
  const lines = [`100644 blob ${readme}\tREADME.md`];
  for (const [name, files] of folders) {
    if (files.size === 0) continue;
    const folder = await tree(
      git,
      [...files].map(([file, sha]) => `100644 blob ${sha}\t${file}.md`),
    );
    lines.push(`040000 tree ${folder}\t${name}`);
  }
  return tree(git, lines);
}

/** The commit's subject and trailers: `Specty-Memory` for an entry, `Specty-Front` for fronts. */
function messageOf(target: MemoryTarget, write: MemoryWrite): string {
  const [subject, own] =
    "entry" in write
      ? [
          memoryCommitSubject(write.operation, write.entry.id, target.lang),
          { "Specty-Memory": write.entry.id },
        ]
      : [write.subject, { "Specty-Front": write.front }];
  const trailers = Object.entries({ ...own, ...target.trailers })
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  return `${subject}\n\n${trailers}\n`;
}

async function hashed(git: Git, content: string): Promise<string> {
  return git.output(["hash-object", "-w", "--stdin"], { input: content });
}

async function tree(git: Git, lines: readonly string[]): Promise<string> {
  return git.output(["mktree"], { input: `${lines.join("\n")}\n` });
}
