// SPDX-License-Identifier: Apache-2.0
// A unified diff, as `git diff` writes it, read into files, hunks and numbered lines; the lines that
// pair up to be seen side by side, and the words that changed between them. Pure.
import { codeTokens, wordDiff } from "./word-diff";

export type DiffLineKind = "context" | "added" | "removed";

/** Where some words sit in a line: from `start` up to `end`, not included. */
interface TextRange {
  readonly start: number;
  readonly end: number;
}

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  /** Its number in the old file; none when it was added. */
  readonly oldNumber?: number;
  /** Its number in the new file; none when it was removed. */
  readonly newNumber?: number;
  /** A removed or added line paired with a similar one: the words that changed. */
  readonly changed?: readonly TextRange[];
}

export interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  /** What git prints after the second @@: the line around it, as «class AttendanceRepository {». */
  readonly section: string;
  readonly lines: readonly DiffLine[];
}

export type DiffFileStatus = "added" | "deleted" | "modified" | "renamed";

export interface DiffFile {
  /** The path now; for a deleted file, the path it had. */
  readonly path: string;
  /** Only for a renamed file: the path it had. */
  readonly oldPath?: string;
  readonly status: DiffFileStatus;
  readonly binary: boolean;
  readonly additions: number;
  readonly deletions: number;
  readonly hunks: readonly DiffHunk[];
}

/** A side-by-side row: the old line on the left, the new one on the right; a side may be empty. */
export interface SplitRow {
  readonly left?: DiffLine;
  readonly right?: DiffLine;
}

/** Below this share of a line kept, its words are not marked: the whole line changed. */
const SIMILAR = 0.4;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

interface Draft {
  path: string;
  oldPath: string | undefined;
  status: DiffFileStatus;
  binary: boolean;
  hunks: (Omit<DiffHunk, "lines"> & { lines: DiffLine[] })[];
}

/** «a/lib/x.dart» → «lib/x.dart»; «/dev/null» → nothing; a quoted path loses its quotes. */
function pathOf(raw: string): string | undefined {
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  const path = unquoted.replace(/\\(["\\])/g, "$1");
  if (path === "/dev/null") return undefined;
  return /^[ab]\//.test(path) ? path.slice(2) : path;
}

/** The two paths of «diff --git a/x b/y»; with spaces in them, the split that gives equal paths. */
function gitPaths(rest: string): [string | undefined, string | undefined] {
  const quoted = rest.match(/^("(?:[^"\\]|\\.)*") ("(?:[^"\\]|\\.)*")$/);
  if (quoted !== null) return [pathOf(quoted[1] ?? ""), pathOf(quoted[2] ?? "")];
  const splits = [...rest.matchAll(/ b\//g)].map((match) => match.index);
  const even = splits.find((at) => rest.slice(2, at) === rest.slice(at + 3));
  const at = even ?? splits[0];
  if (at === undefined) return [pathOf(rest), undefined];
  return [pathOf(rest.slice(0, at)), pathOf(rest.slice(at + 1))];
}

/** Marks the words that changed in each pair of similar removed and added lines of a hunk. */
function markWords(lines: DiffLine[]): DiffLine[] {
  const out = [...lines];
  let i = 0;
  while (i < out.length) {
    const removed: number[] = [];
    while (out[i]?.kind === "removed") removed.push(i++);
    const added: number[] = [];
    while (out[i]?.kind === "added") added.push(i++);
    if (removed.length === 0 && added.length === 0) i++;
    for (let k = 0; k < Math.min(removed.length, added.length); k++) {
      markPair(out, removed[k] ?? 0, added[k] ?? 0);
    }
  }
  return out;
}

/** Marks the changed words of a removed line and the added line it pairs with, if they are similar. */
function markPair(out: DiffLine[], left: number, right: number): void {
  const [oldLine, newLine] = [out[left], out[right]];
  if (oldLine === undefined || newLine === undefined) return;
  const pair = rangesOf(oldLine.text, newLine.text);
  if (pair === undefined) return;
  out[left] = { ...oldLine, changed: pair.before };
  out[right] = { ...newLine, changed: pair.after };
}

/** The changed words of a pair, by where they sit in each text; nothing if they share too little. */
function rangesOf(
  before: string,
  after: string,
): { before: TextRange[]; after: TextRange[] } | undefined {
  const removed: TextRange[] = [];
  const added: TextRange[] = [];
  let [a, b, kept] = [0, 0, 0];
  for (const part of wordDiff(before, after, codeTokens)) {
    const length = part.text.length;
    if (part.change !== "added") {
      if (part.change === "removed") removed.push({ start: a, end: a + length });
      a += length;
    }
    if (part.change !== "removed") {
      if (part.change === "added") added.push({ start: b, end: b + length });
      b += length;
    }
    if (part.change === undefined) kept += part.text.trim().length;
  }
  const longest = Math.max(before.trim().length, after.trim().length, 1);
  return kept / longest < SIMILAR ? undefined : { before: removed, after: added };
}

function finish(draft: Draft): DiffFile {
  const hunks = draft.hunks.map((hunk) => ({ ...hunk, lines: markWords(hunk.lines) }));
  const lines = hunks.flatMap((hunk) => hunk.lines);
  const renamed = draft.status === "renamed" && draft.oldPath !== draft.path;
  return {
    path: draft.path,
    ...(renamed && draft.oldPath !== undefined ? { oldPath: draft.oldPath } : {}),
    status: draft.status === "renamed" && !renamed ? "modified" : draft.status,
    binary: draft.binary,
    additions: lines.filter((line) => line.kind === "added").length,
    deletions: lines.filter((line) => line.kind === "removed").length,
    hunks,
  };
}

/** Reads `git diff` output; what it does not understand, it skips. */
export function parseDiff(text: string): readonly DiffFile[] {
  const files: DiffFile[] = [];
  let draft: Draft | undefined;
  let cursor: HunkCursor | undefined;
  for (const line of text.split("\n").map((raw) => raw.replace(/\r$/, ""))) {
    if (line.startsWith("diff --git ")) {
      if (draft !== undefined) files.push(finish(draft));
      draft = draftOf(line.slice("diff --git ".length));
      cursor = undefined;
      continue;
    }
    if (draft === undefined || line.startsWith("\\")) continue;
    if (cursor !== undefined && takeLine(cursor, line)) continue;
    const hunk = HUNK.exec(line);
    if (hunk !== null) cursor = openHunk(draft, hunk);
    else readHeader(draft, line);
  }
  if (draft !== undefined) files.push(finish(draft));
  return files;
}

/** A file as «diff --git a/x b/y» starts it: modified until its headers say otherwise. */
function draftOf(paths: string): Draft {
  const [a, b] = gitPaths(paths);
  return { path: b ?? a ?? "", oldPath: a, status: "modified", binary: false, hunks: [] };
}

/** A hunk being read: its lines, what its counts still expect, and the next number on each side. */
interface HunkCursor {
  readonly lines: DiffLine[];
  oldLeft: number;
  newLeft: number;
  oldAt: number;
  newAt: number;
}

/** A hunk's header opens it in the file: a count left out, as in «@@ -3 +3 @@», is one line. */
function openHunk(draft: Draft, hunk: RegExpExecArray): HunkCursor {
  const count = (group: string | undefined) => (group === undefined ? 1 : Number(group));
  const cursor: HunkCursor = {
    lines: [],
    oldAt: Number(hunk[1]),
    oldLeft: count(hunk[2]),
    newAt: Number(hunk[3]),
    newLeft: count(hunk[4]),
  };
  draft.hunks.push({
    oldStart: cursor.oldAt,
    oldLines: cursor.oldLeft,
    newStart: cursor.newAt,
    newLines: cursor.newLeft,
    section: hunk[5] ?? "",
    lines: cursor.lines,
  });
  return cursor;
}

/** Takes a line into the hunk when its counts expect it; whether it did. */
function takeLine(cursor: HunkCursor, line: string): boolean {
  const kind = expected(line[0] ?? " ", cursor);
  if (kind === undefined) {
    // A line the counts did not expect ends the hunk; it is read as anything else.
    cursor.oldLeft = 0;
    cursor.newLeft = 0;
    return false;
  }
  const old = kind === "added" ? {} : { oldNumber: cursor.oldAt++ };
  const now = kind === "removed" ? {} : { newNumber: cursor.newAt++ };
  cursor.lines.push({ kind, text: line.slice(1), ...old, ...now });
  if (kind !== "added") cursor.oldLeft--;
  if (kind !== "removed") cursor.newLeft--;
  return true;
}

/** What a hunk line is by its sign, when the counts still expect one of its kind. */
function expected(sign: string, cursor: HunkCursor): DiffLineKind | undefined {
  if (sign === " " && cursor.oldLeft > 0 && cursor.newLeft > 0) return "context";
  if (sign === "-" && cursor.oldLeft > 0) return "removed";
  if (sign === "+" && cursor.newLeft > 0) return "added";
  return undefined;
}

/** What each header line says of its file, by how the line starts. */
const HEADERS: readonly (readonly [string, (draft: Draft, rest: string) => void])[] = [
  [
    "new file mode",
    (draft) => {
      draft.status = "added";
    },
  ],
  [
    "deleted file mode",
    (draft) => {
      draft.status = "deleted";
    },
  ],
  [
    "rename from ",
    (draft, rest) => {
      draft.status = "renamed";
      draft.oldPath = pathOf(rest);
    },
  ],
  [
    "rename to ",
    (draft, rest) => {
      draft.status = "renamed";
      draft.path = pathOf(rest) ?? draft.path;
    },
  ],
  [
    "Binary files ",
    (draft) => {
      draft.binary = true;
    },
  ],
  [
    "--- ",
    (draft, rest) => {
      draft.oldPath = pathOf(rest) ?? draft.oldPath;
    },
  ],
  [
    "+++ ",
    (draft, rest) => {
      draft.path = pathOf(rest) ?? draft.path;
    },
  ],
];

/** A line outside the hunks: what its header says of the file, if it is one. */
function readHeader(draft: Draft, line: string): void {
  if (line === "GIT binary patch") {
    draft.binary = true;
    return;
  }
  const header = HEADERS.find(([start]) => line.startsWith(start));
  header?.[1](draft, line.slice(header[0].length));
}

/**
 * A hunk side by side: context on both sides, and each run of removed lines paired, in order,
 * with the run of added lines that follows it; what is left over has an empty side.
 */
export function splitRows(hunk: DiffHunk): readonly SplitRow[] {
  const rows: SplitRow[] = [];
  const { lines } = hunk;
  let i = 0;
  /** The run of lines of `kind` from `i` on, leaving `i` after it. */
  const run = (kind: DiffLineKind): DiffLine[] => {
    const found: DiffLine[] = [];
    for (let line = lines[i]; line?.kind === kind; line = lines[++i]) found.push(line);
    return found;
  };
  while (i < lines.length) {
    const context = run("context");
    for (const line of context) rows.push({ left: line, right: line });
    const removed = run("removed");
    const added = run("added");
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      const [left, right] = [removed[k], added[k]];
      rows.push({
        ...(left === undefined ? {} : { left }),
        ...(right === undefined ? {} : { right }),
      });
    }
  }
  return rows;
}
