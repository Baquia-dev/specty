// SPDX-License-Identifier: Apache-2.0
import type { Finding } from "./report";

/**
 * Findings in what a tool printed, whatever the tool: almost all of them mark a problem with
 * `path:line` or `path(line,column)` somewhere on its line, and ESLint's default format puts the
 * path on a line of its own with `line:column` on the next ones. A line with no location says
 * nothing on its own; without any location at all, the last lines are what is left to show.
 */

/** At most this many findings from one output, so a broken build does not flood the report. */
const MAX_FINDINGS = 100;
/** Lines shown when the output has no location. */
const LAST_LINES = 5;
const MAX_MESSAGE = 200;

// A path with an extension, not inside a URL (`https://host.com:8080`) or a longer word.
const PATH = String.raw`(?:\.{1,2}\/|\/)?(?:[\w@.\-]+\/)*[\w@\-][\w@.\-]*\.[A-Za-z]\w*`;
const LOCATION = new RegExp(
  String.raw`(?<![\w/:.@\\-])(?<path>${PATH})(?::(?<line>\d+)(?::\d+)?|\((?<paren>\d+)(?:,\d+)?\))`,
);
const BARE_PATH = new RegExp(String.raw`^\s*(?<path>${PATH})\s*$`);
const ESLINT_ENTRY = /^\s+(?<line>\d+):\d+\s+(?<message>\S.*)$/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape that starts a colour.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
const SEPARATORS = /^[\s:\-–•·|›>❯]+|[\s:\-–•·|›>❯]+$/g;
const RULES = /[━─│┃]+/g;

export function findingsInOutput(output: string, root: string): Finding[] {
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  const found: Finding[] = [];
  let file: string | undefined;
  lines.forEach((line, index) => {
    if (line.trim() === "") {
      file = undefined;
      return;
    }
    const located = locate(line, lines, index, root);
    if (located !== undefined) {
      found.push(located);
      return;
    }
    const bare = BARE_PATH.exec(line)?.groups?.path;
    if (bare !== undefined) {
      file = relativeTo(bare, root);
      return;
    }
    const entry = ESLINT_ENTRY.exec(line)?.groups;
    if (file !== undefined && entry?.line !== undefined && entry.message !== undefined) {
      found.push({ path: file, line: Number(entry.line), message: oneLine(entry.message) });
    }
  });
  const unique = found.filter(
    (finding, index) =>
      found.findIndex(
        (other) =>
          other.path === finding.path &&
          other.line === finding.line &&
          other.message === finding.message,
      ) === index,
  );
  if (unique.length > 0) return unique.slice(0, MAX_FINDINGS);
  return lines
    .map((line) => oneLine(line))
    .filter((line) => line.length > 0)
    .slice(-LAST_LINES)
    .map((message) => ({ message }));
}

/** The finding of a line with a location; its message, the rest of the line or the line before. */
function locate(
  line: string,
  lines: readonly string[],
  index: number,
  root: string,
): Finding | undefined {
  const match = LOCATION.exec(line);
  const path = match?.groups?.path;
  const number = match?.groups?.line ?? match?.groups?.paren;
  if (match === null || path === undefined || number === undefined) return undefined;
  const after = clean(line.slice(match.index + match[0].length));
  const before = clean(line.slice(0, match.index));
  const message = after || before || clean(previous(lines, index));
  return { path: relativeTo(path, root), line: Number(number), message };
}

function previous(lines: readonly string[], index: number): string {
  return (
    lines
      .slice(0, index)
      .toReversed()
      .find((line) => line.trim() !== "") ?? ""
  );
}

function clean(text: string): string {
  return oneLine(text.replace(RULES, " ")).replace(SEPARATORS, "");
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
}

/** Repository-relative, with `/`, when the tool printed it under `root` or with `./`. */
function relativeTo(path: string, root: string): string {
  const slashed = path.replaceAll("\\", "/");
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  if (slashed.startsWith(prefix)) return slashed.slice(prefix.length);
  return slashed.startsWith("./") ? slashed.slice(2) : slashed;
}
