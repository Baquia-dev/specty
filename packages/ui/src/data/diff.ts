// SPDX-License-Identifier: Apache-2.0
// A unified diff, as `git diff` writes it, read into files, hunks and numbered lines; the lines that
// pair up to be seen side by side, and the words that changed between them. Pure.
import { codeTokens, wordDiff } from "./word-diff";

export type DiffLineKind = "context" | "added" | "removed";

/** Where some words sit in a line: from `start` up to `end`, not included. */
export interface TextRange {
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
      const [left, right] = [removed[k] ?? 0, added[k] ?? 0];
      const [oldLine, newLine] = [out[left], out[right]];
      if (oldLine === undefined || newLine === undefined) continue;
      const pair = rangesOf(oldLine.text, newLine.text);
      if (pair === undefined) continue;
      out[left] = { ...oldLine, changed: pair.before };
      out[right] = { ...newLine, changed: pair.after };
    }
  }
  return out;
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
  let lines: DiffLine[] | undefined;
  let [oldLeft, newLeft, oldAt, newAt] = [0, 0, 0, 0];
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.startsWith("diff --git ")) {
      if (draft !== undefined) files.push(finish(draft));
      const [a, b] = gitPaths(line.slice("diff --git ".length));
      draft = { path: b ?? a ?? "", oldPath: a, status: "modified", binary: false, hunks: [] };
      lines = undefined;
      continue;
    }
    if (draft === undefined || line.startsWith("\\")) continue;
    if (lines !== undefined && (oldLeft > 0 || newLeft > 0)) {
      const sign = line[0] ?? " ";
      const body = line.slice(1);
      if (sign === " " && oldLeft > 0 && newLeft > 0) {
        lines.push({ kind: "context", text: body, oldNumber: oldAt++, newNumber: newAt++ });
        [oldLeft, newLeft] = [oldLeft - 1, newLeft - 1];
        continue;
      }
      if (sign === "-" && oldLeft > 0) {
        lines.push({ kind: "removed", text: body, oldNumber: oldAt++ });
        oldLeft--;
        continue;
      }
      if (sign === "+" && newLeft > 0) {
        lines.push({ kind: "added", text: body, newNumber: newAt++ });
        newLeft--;
        continue;
      }
      // A line the counts did not expect ends the hunk; it is read as anything else.
      [oldLeft, newLeft] = [0, 0];
    }
    const hunk = HUNK.exec(line);
    if (hunk !== null) {
      // «@@ -3 +3 @@»: a count left out is one line.
      const count = (group: string | undefined) => (group === undefined ? 1 : Number(group));
      [oldAt, oldLeft] = [Number(hunk[1]), count(hunk[2])];
      [newAt, newLeft] = [Number(hunk[3]), count(hunk[4])];
      lines = [];
      draft.hunks.push({
        oldStart: oldAt,
        oldLines: oldLeft,
        newStart: newAt,
        newLines: newLeft,
        section: hunk[5] ?? "",
        lines,
      });
    } else if (line.startsWith("new file mode")) draft.status = "added";
    else if (line.startsWith("deleted file mode")) draft.status = "deleted";
    else if (line.startsWith("rename from ")) {
      draft.status = "renamed";
      draft.oldPath = pathOf(line.slice("rename from ".length));
    } else if (line.startsWith("rename to ")) {
      draft.status = "renamed";
      draft.path = pathOf(line.slice("rename to ".length)) ?? draft.path;
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") draft.binary = true;
    else if (line.startsWith("--- ")) draft.oldPath = pathOf(line.slice(4)) ?? draft.oldPath;
    else if (line.startsWith("+++ ")) draft.path = pathOf(line.slice(4)) ?? draft.path;
  }
  if (draft !== undefined) files.push(finish(draft));
  return files;
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
