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
  let from: string | undefined;
  let to: string | undefined;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      [from, to, inHunk] = [undefined, undefined, false];
    } else if (!inHunk) {
      // File headers come before the first hunk; inside it, `--- x` is a removed line.
      if (line.startsWith("--- ")) from = side(line.slice(4), "a/");
      else if (line.startsWith("+++ ")) to = side(line.slice(4), "b/");
      else if (line.startsWith("@@")) inHunk = true;
    } else {
      const path = to ?? from;
      const sign = line.startsWith("-") ? 1 : line.startsWith("+") ? -1 : 0;
      if (path !== undefined && sign !== 0 && isAssertion(line.slice(1))) {
        net.set(path, (net.get(path) ?? 0) + sign);
      }
    }
  }
  return [...net]
    .filter(([, removed]) => removed > 0)
    .map(([path, removed]) => ({ path, removed }))
    .toSorted((a, b) => a.path.localeCompare(b.path));
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
