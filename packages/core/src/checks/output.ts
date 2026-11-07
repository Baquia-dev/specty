// SPDX-License-Identifier: Apache-2.0
import type { Finding } from "./report";

/**
 * Findings in what a tool printed, whatever the tool: almost all of them mark a problem with
 * `path:line` or `path(line,column)` somewhere on its line, and ESLint's default format puts the
 * path on a line of its own with `line:column` on the next ones. A line with no location says
 * nothing on its own; without any location at all, the last lines are what is left to show.
 */

/** How much of an output becomes findings: `internal.findings` (formats.md §6). */
export interface FindingLimits {
  /** At most this many findings from one output, so a broken build does not flood the report. */
  readonly perCommand: number;
  /** Lines shown when the output has no location. */
  readonly lastLines: number;
  /** The characters of each finding's message. */
  readonly messageChars: number;
}

/** Today's limits, the defaults of `internal.findings`. */
export const DEFAULT_FINDING_LIMITS: FindingLimits = {
  perCommand: 100,
  lastLines: 5,
  messageChars: 200,
};

// A path with an extension, not inside a URL (`https://host.com:8080`) or a longer word.
const PATH = String.raw`(?:\.{1,2}\/|\/)?(?:[\w@.\-]+\/)*[\w@\-][\w@.\-]*\.[A-Za-z]\w*`;
const LOCATION = new RegExp(
  String.raw`(?<![\w/:.@\\-])(?<path>${PATH})(?::(?<line>\d+)(?::\d+)?|\((?<paren>\d+)(?:,\d+)?\))`,
);
const BARE_PATH = new RegExp(String.raw`^\s*(?<path>${PATH})\s*$`);
const ESLINT_ENTRY = /^\s+(?<line>\d+):\d+\s+(?<message>\S.*)$/;
// The escape that starts a colour, by its code: written in a regex, a control character reads
// as a mistake.
const ESC = String.fromCharCode(0x1b);
const ANSI = new RegExp(String.raw`${ESC}\[[0-9;]*[A-Za-z]`, "g");
const SEPARATORS = /^[\s:\-–•·|›>❯]+|[\s:\-–•·|›>❯]+$/g;
const RULES = /[━─│┃]+/g;

export function findingsInOutput(
  output: string,
  root: string,
  limits: FindingLimits = DEFAULT_FINDING_LIMITS,
): Finding[] {
  const max = limits.messageChars;
  const lines = output.replace(ANSI, "").split(/\r?\n/);
  const found: Finding[] = [];
  let file: string | undefined;
  lines.forEach((line, index) => {
    if (line.trim() === "") {
      file = undefined;
      return;
    }
    const located = locate(line, lines, index, root, max);
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
      found.push({ path: file, line: Number(entry.line), message: oneLine(entry.message, max) });
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
  if (unique.length > 0) return unique.slice(0, limits.perCommand);
  return lines
    .map((line) => oneLine(line, max))
    .filter((line) => line.length > 0)
    .slice(-limits.lastLines)
    .map((message) => ({ message }));
}

/**
 * The finding of a line with a location; its message, the rest of the line or the line before,
 * of `max` characters at most.
 */
function locate(
  line: string,
  lines: readonly string[],
  index: number,
  root: string,
  max: number,
): Finding | undefined {
  const match = LOCATION.exec(line);
  const path = match?.groups?.path;
  const number = match?.groups?.line ?? match?.groups?.paren;
  if (match === null || path === undefined || number === undefined) return undefined;
  const after = clean(line.slice(match.index + match[0].length), max);
  const before = clean(line.slice(0, match.index), max);
  const message = after || before || clean(previous(lines, index), max);
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

function clean(text: string, max: number): string {
  return oneLine(text.replace(RULES, " "), max).replace(SEPARATORS, "");
}

function oneLine(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Repository-relative, with `/`, when the tool printed it under `root` or with `./`. */
function relativeTo(path: string, root: string): string {
  const slashed = path.replaceAll("\\", "/");
  const prefix = `${root.replaceAll("\\", "/").replace(/\/$/, "")}/`;
  if (slashed.startsWith(prefix)) return slashed.slice(prefix.length);
  return slashed.startsWith("./") ? slashed.slice(2) : slashed;
}
