// SPDX-License-Identifier: Apache-2.0

/**
 * The JUnit XML reports `test-time` and the fresh verification read, the format almost every test
 * tool can write (Vitest, Jest, pytest, Maven, Gradle, go-junit-report…): each `<testcase>` with
 * its time in seconds and, when it failed, a `<failure>` or an `<error>` inside.
 */

/** A test that failed in a report: the file it names, if it names one, and its name. */
export interface FailedTest {
  readonly path?: string;
  readonly name: string;
}

/** A test of a report: the file it names, if it names one, its name and how long it took. */
export interface TestTime extends FailedTest {
  readonly ms: number;
}

/** A `<testcase>` as read: its test, its time in seconds (`NaN` without one) and whether it failed. */
interface TestCase {
  readonly test: FailedTest;
  readonly seconds: number;
  readonly failed: boolean;
}

/** An opening or closing tag of a suite or a test; a quoted attribute may hold a `>`. */
const TAG = /<(\/?)(testsuite|testcase)\b((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
/** What a failed test holds; `<skipped>`, `<system-err>` or Surefire's `<flakyFailure>` do not count. */
const FAILURE = /<(failure|error)\b/;
const ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

/**
 * Each `<testcase>` of the report in `text` that has a time. Its file is its `file`, else the one
 * of the nearest `<testsuite>` around it that has one, else its `classname` (the file in Vitest,
 * the class in Java's JUnit); an absolute path inside `root` becomes relative to it. What a
 * comment or a CDATA section holds, such as a test's output, is not read.
 */
export function parseJunit(text: string, root: string): readonly TestTime[] {
  return testCases(text, root).flatMap(({ test, seconds }) =>
    Number.isFinite(seconds) ? [{ ...test, ms: Math.round(seconds * 1000) }] : [],
  );
}

/**
 * Each `<testcase>` of the report in `text` with a `<failure>` or an `<error>` inside, with or
 * without a time: its file and its name, as `parseJunit` reads them.
 */
export function parseJunitFailures(text: string, root: string): readonly FailedTest[] {
  return testCases(text, root).flatMap(({ test, failed }) => (failed ? [test] : []));
}

/** Each `<testcase>` with a name, outside comments and CDATA sections, with its suite's file. */
function testCases(text: string, root: string): readonly TestCase[] {
  const plain = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const suites: (string | undefined)[] = [];
  const tests: TestCase[] = [];
  for (const match of plain.matchAll(TAG)) {
    const [tag, closing, element, attributes = "", empty] = match;
    if (element === "testcase") {
      if (closing === "/") continue;
      const failed = empty !== "/" && FAILURE.test(bodyOf(plain, match.index + tag.length));
      const suiteFile = suites.findLast((file) => file !== undefined);
      const test = testOf(attributes, suiteFile, root, failed);
      if (test !== undefined) tests.push(test);
    } else if (closing === "/") suites.pop();
    else if (empty !== "/") suites.push(attributeOf(attributes, "file"));
  }
  return tests;
}

/** What an open `<testcase>` holds: up to its closing tag; nothing if it has none. */
function bodyOf(text: string, from: number): string {
  const end = text.indexOf("</testcase", from);
  return end === -1 ? "" : text.slice(from, end);
}

/** The tests over `maxMs`, the longest first; those that take the same keep their order. */
export function slowTests(tests: readonly TestTime[], maxMs: number): readonly TestTime[] {
  return tests.filter((test) => test.ms > maxMs).toSorted((a, b) => b.ms - a.ms);
}

/** The test a `<testcase>` with these attributes describes, or none without a name. */
function testOf(
  attributes: string,
  suiteFile: string | undefined,
  root: string,
  failed: boolean,
): TestCase | undefined {
  const name = attributeOf(attributes, "name");
  if (name === undefined) return undefined;
  const time = attributeOf(attributes, "time")?.trim() ?? "";
  const seconds = time === "" ? Number.NaN : Number(time);
  const file = attributeOf(attributes, "file") ?? suiteFile ?? attributeOf(attributes, "classname");
  const test = file === undefined || file === "" ? { name } : { path: fromRoot(file, root), name };
  return { test, seconds, failed };
}

function attributeOf(attributes: string, name: string): string | undefined {
  for (const [, key, double, single] of attributes.matchAll(ATTRIBUTE)) {
    if (key === name) return decoded(double ?? single ?? "");
  }
  return undefined;
}

/** The text of an attribute, with its character references resolved. */
function decoded(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (!body.startsWith("#")) return ENTITIES[body] ?? entity;
    const hex = body[1] === "x" || body[1] === "X";
    const code = hex ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** `path` with forward slashes, relative to `root` when it is inside it. */
function fromRoot(path: string, root: string): string {
  const slashed = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const base = `${root.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
  return slashed.startsWith(base) ? slashed.slice(base.length) : slashed;
}
