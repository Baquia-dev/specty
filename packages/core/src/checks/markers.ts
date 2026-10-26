// SPDX-License-Identifier: Apache-2.0
import type { TodoConfig } from "../schema/checks";

/**
 * Markers `specty check` looks for line by line, in any language: a test that focuses on itself
 * or is switched off, and pending work that points to no issue. The catalog holds the declarative
 * markers of each family of test frameworks; a skip that depends on a condition (`t.Skip()`,
 * `pytest.skip()`, `test.skipIf`) is a decision of the test and does not count.
 */

/** A line with a marker, from 1, and the marker as written. */
export interface Mark {
  readonly line: number;
  readonly marker: string;
}

// Not the end of a longer name, a property or a string: `model.fit(` and `"fit"` are no tests.
const START = String.raw`(?<![\w.$'"\`])`;
const SUITE = String.raw`(?:describe|it|test|context|suite|specify)(?:\.(?:concurrent|sequential))?`;
const PREFIXED = "(?:describe|it|test|context|specify)";
// A prefixed marker takes the test's name: `fit("…"` or `fit '…'`, never `def fit(self`.
const NAMED = String.raw`(?=\s*\(\s*['"\`]|\s+['"\`])`;
// A named argument, alone on its line or after another one: `}, solo: true);`.
const ARGUMENT = String.raw`(?:^\s*|,\s*)`;
const ARGUMENT_END = String.raw`(?=\s*[),]|\s*$)`;
// Ginkgo's nodes, which a prefix (`FIt`, `PIt`, `XIt`) or a decorator (`It("a", Focus, …)`) marks.
const GINKGO = "(?:It|Specify|Describe(?:Table(?:Subtree)?)?|Context|When|Entry)";
const ginkgoDecorator = (name: string) =>
  new RegExp(String.raw`(?<![\w.])${GINKGO}\s*\(\s*"[^"]*".*?,\s*(?<m>${name})\s*[,)]`);

const FOCUSED: readonly RegExp[] = [
  // Jest, Vitest, Mocha, Jasmine
  new RegExp(String.raw`${START}(?<m>${SUITE}\.only)\b`),
  new RegExp(`${START}(?<m>f${PREFIXED})${NAMED}`),
  // package:test
  new RegExp(String.raw`${ARGUMENT}(?<m>solo\s*:\s*true)${ARGUMENT_END}`),
  // RSpec
  /,\s*(?<m>focus\s*:\s*true)(?=\s*(?:do\b|[{),]|$))/,
  /,\s*(?<m>:focus)\b/,
  // Ginkgo
  new RegExp(String.raw`(?<![\w.])(?<m>F${GINKGO})\s*\(`),
  ginkgoDecorator("Focus"),
  // Pest, on a test or on the whole file; Laravel's `->only([…])` takes the keys it keeps.
  /(?<m>->only\(\s*\))/,
];

const SKIPPED: readonly RegExp[] = [
  // Jest, Vitest, Mocha, Jasmine, RSpec
  new RegExp(String.raw`${START}(?<m>${SUITE}\.skip)\b`),
  new RegExp(`${START}(?<m>x${PREFIXED})${NAMED}`),
  // package:test
  new RegExp(String.raw`${ARGUMENT}(?<m>skip\s*:\s*(?:true|'[^']*'|"[^"]*"))${ARGUMENT_END}`),
  // pytest, unittest
  /(?<m>@pytest\.mark\.skip)\b/,
  /(?<m>@unittest\.skip)\b/,
  // Rust
  /(?<m>#\[ignore(?:\s*=\s*"[^"]*")?\])/,
  // JUnit, TestNG
  /(?<m>@(?:Disabled|Ignore))\b/,
  /@Test\s*\([^)]*\b(?<m>enabled\s*=\s*false)\b/,
  // NUnit, MSTest, xUnit
  /[[,]\s*(?<m>Ignore)\b/,
  /\b(?<m>Skip\s*=\s*"[^"]*")/,
  // Ginkgo
  new RegExp(String.raw`(?<![\w.])(?<m>[PX]${GINKGO})\s*\(`),
  ginkgoDecorator("Pending"),
  // Swift Testing, with no reason or a written one; SwiftUI's `.disabled(flag)` is no test.
  /(?<m>\.disabled\(\s*(?:"[^"]*")?\s*\))/,
  // Pest, with no reason or a written one; a condition decides at run time.
  /(?<m>->skip\(\s*(?:'[^']*'|"[^"]*")?\s*\))/,
];

const CASES: readonly RegExp[] = [
  // Jest, Vitest, Mocha, Jasmine, package:test
  /(?<![\w.$'"`])(?:it|test|specify|testWidgets|testGoldens)(?:\.\w+)*\s*\(/,
  // RSpec
  /(?<![\w.$'"`])(?:it|specify|scenario)\s+['"]/,
  // pytest, unittest
  /^\s*(?:async\s+)?def\s+test\w*\s*\(/,
  // Go, XCTest
  /^func\s+Test\w*\s*\(/,
  /\bfunc\s+test\w*\s*\(/,
  // JUnit, TestNG
  /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/,
  // xUnit, NUnit, MSTest
  /\[\s*(?:Fact|Theory|Test|TestCase|TestMethod|DataTestMethod)\b/,
  // Rust
  /#\[(?:\w+::)?test\]/,
  // PHPUnit
  /\bpublic\s+function\s+test\w*\s*\(/,
];

// A line that is all comment declares no case; `#[test]` is Rust, not a comment.
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#(?!\[)|--)/;

// Where a comment starts in most languages; pending work is the first word of a comment.
const OPENER = String.raw`(?:\/\/+|\/\*+|^\s*\*+|#+|<!--|--|;+|%+)`;

/** Tests that run alone and leave the others out: `describe.only`, `fit`, `solo: true`… */
export function focusedTests(text: string): Mark[] {
  return marks(text, (line) => firstMarker(FOCUSED, line));
}

/** Tests switched off by a marker: `it.skip`, `xit`, `@Disabled`, `#[ignore]`… */
export function skippedTests(text: string): Mark[] {
  return marks(text, (line) => firstMarker(SKIPPED, line));
}

/**
 * The test cases a file declares, one per line, by the catalog of each family of frameworks:
 * enough to see that a test file lost cases, not to measure them exactly.
 */
export function testCases(text: string): number {
  return text
    .split(/\r?\n/)
    .filter((line) => !COMMENT_LINE.test(line) && CASES.some((pattern) => pattern.test(line)))
    .length;
}

/** Comments that start with a marker of pending work and point to no issue. */
export function unreferencedTodos(text: string, todo: TodoConfig): Mark[] {
  const markers = todo.markers.map(escaped).join("|");
  const pending = new RegExp(String.raw`${OPENER}\s*(?<m>${markers})(?!\w)(?<rest>.*)$`);
  const reference = new RegExp(todo.reference);
  return marks(text, (line) => {
    const groups = pending.exec(line)?.groups;
    if (groups?.m === undefined || reference.test(groups.rest ?? "")) return undefined;
    return groups.m;
  });
}

function marks(text: string, find: (line: string) => string | undefined): Mark[] {
  return text.split(/\r?\n/).flatMap((source, index) => {
    const marker = find(source);
    return marker === undefined ? [] : [{ line: index + 1, marker }];
  });
}

function firstMarker(patterns: readonly RegExp[], line: string): string | undefined {
  for (const pattern of patterns) {
    const marker = pattern.exec(line)?.groups?.m;
    if (marker !== undefined) return marker;
  }
  return undefined;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
