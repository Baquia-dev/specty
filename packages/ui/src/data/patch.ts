// SPDX-License-Identifier: Apache-2.0
// The patch of an unlock (ADR 0014), as `git apply --check --recount` read it when the agent
// asked: the counts of each hunk come from its lines, and a plain unified diff, with `---` and
// `+++` but no `diff --git`, is read too. Then, the diff viewer's files.
import { type DiffFile, parseDiff } from "./diff";

const HUNK_HEAD = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * How many lines after `start` belong to its hunk, as git's `--recount` reads them: those that
 * begin with a space, `-`, `+` or `\`, and empty ones, up to the first that does not.
 */
function hunkLength(lines: readonly string[], start: number): number {
  let end = start;
  while (end < lines.length && /^(?:[ +\-\\]|$)/.test(lines[end] ?? "")) end++;
  return end - start;
}

/** A hunk with the counts its own lines give, and those lines. */
function recounted(head: RegExpExecArray, body: readonly string[]): readonly string[] {
  const old = body.filter((line) => !line.startsWith("+") && !line.startsWith("\\")).length;
  const now = body.filter((line) => !line.startsWith("-") && !line.startsWith("\\")).length;
  return [`@@ -${head[1]},${old} +${head[2]},${now} @@${head[3] ?? ""}`, ...body];
}

/** The path of a `---` or `+++` line: without its prefix and the date some tools add. */
const sideOf = (line: string) => line.slice(4).split("\t")[0] ?? "";

/**
 * The `diff --git` header a plain unified diff leaves out, for the file of its `---` and `+++`:
 * deleted when `+++` is `/dev/null`, as a patch that removes the test says.
 */
function gitHeader(minus: string, plus: string): readonly string[] {
  const [old, now] = [sideOf(minus), sideOf(plus)];
  const deleted = now === "/dev/null";
  const path = (deleted ? old : now).replace(/^[ab]\//, "");
  return [`diff --git a/${path} b/${path}`, ...(deleted ? ["deleted file mode 100644"] : [])];
}

/** The files of an unlock's patch, read as git read it to apply it. */
export function patchFiles(patch: string): readonly DiffFile[] {
  const lines = patch.replace(/\n$/, "").split("\n");
  const out: string[] = [];
  let headed = false;
  let at = 0;
  while (at < lines.length) {
    const line = lines[at] ?? "";
    const head = HUNK_HEAD.exec(line);
    if (head !== null) {
      const length = hunkLength(lines, at + 1);
      out.push(...recounted(head, lines.slice(at + 1, at + 1 + length)));
      headed = false;
      at += 1 + length;
      continue;
    }
    if (line.startsWith("diff --git ")) headed = true;
    const next = lines[at + 1] ?? "";
    if (!headed && line.startsWith("--- ") && next.startsWith("+++ ")) {
      out.push(...gitHeader(line, next));
    }
    out.push(line);
    at++;
  }
  return parseDiff(out.join("\n"));
}
