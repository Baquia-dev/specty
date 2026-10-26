// SPDX-License-Identifier: Apache-2.0

/** A test file that lost assertions: how many more it removed than it added. */
export interface AssertionLoss {
  readonly path: string;
  readonly removed: number;
}

/**
 * Lines that assert in common test frameworks: `expect(…)`, `assert…(` or `assert…!`, Python's
 * `assert x`, Go's `assert.`/`require.` and `t.Error`/`t.Fatal`, `XCTAssert…` and `.should`.
 */
const ASSERTION =
  /\b(?:expect|assert\w*|XCTAssert\w*)\s*[(!]|\bassert\s|\b(?:assert|require)\.\w|\.should\b|\bt\.(?:Error|Fatal)f?\(/;

const COMMENT = /^\s*(?:\/\/|\/\*|\*|#|--)/;

/**
 * Test files of a unified `git diff` that lost assertions: in each, the removed assertion lines
 * minus the added ones, so moving or rewording one is not a loss but commenting it out is.
 */
export function removedAssertions(diff: string): readonly AssertionLoss[] {
  const net = new Map<string, number>();
  let cursor: DiffCursor = { from: undefined, to: undefined, inHunk: false };
  for (const line of diff.split("\n")) {
    if (cursor.inHunk && !line.startsWith("diff --git ")) count(net, cursor, line);
    else cursor = header(cursor, line);
  }
  return [...net]
    .filter(([, removed]) => removed > 0)
    .map(([path, removed]) => ({ path, removed }))
    .toSorted((a, b) => a.path.localeCompare(b.path));
}

/** Where a diff walk is: the file's two sides, and whether its hunks started. */
interface DiffCursor {
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly inHunk: boolean;
}

/** A new file, its headers or its first hunk. File headers come before the first hunk. */
function header(cursor: DiffCursor, line: string): DiffCursor {
  if (line.startsWith("diff --git ")) return { from: undefined, to: undefined, inHunk: false };
  if (line.startsWith("--- ")) return { ...cursor, from: side(line.slice(4), "a/") };
  if (line.startsWith("+++ ")) return { ...cursor, to: side(line.slice(4), "b/") };
  if (line.startsWith("@@")) return { ...cursor, inHunk: true };
  return cursor;
}

/** A line of a hunk: a removed assertion counts one, an added one takes one back. */
function count(net: Map<string, number>, cursor: DiffCursor, line: string): void {
  // Inside a hunk, `--- x` is a removed line, not a header.
  const path = cursor.to ?? cursor.from;
  const sign = line.startsWith("-") ? 1 : line.startsWith("+") ? -1 : 0;
  if (path !== undefined && sign !== 0 && isAssertion(line.slice(1))) {
    net.set(path, (net.get(path) ?? 0) + sign);
  }
}

function isAssertion(code: string): boolean {
  return !COMMENT.test(code) && ASSERTION.test(code);
}

/** The path of a `---`/`+++` header, or undefined for `/dev/null`. */
function side(name: string, prefix: string): string | undefined {
  const path = name.replace(/\t$/, "");
  if (path === "/dev/null") return undefined;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
