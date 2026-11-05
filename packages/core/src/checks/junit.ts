// SPDX-License-Identifier: Apache-2.0

/**
 * The JUnit XML reports `test-time` reads, the format almost every test tool can write (Vitest,
 * Jest, pytest, Maven, Gradle, go-junit-report…): each `<testcase>` with its time in seconds.
 */

/** A test of a report: the file it names, if it names one, its name and how long it took. */
export interface TestTime {
  readonly path?: string;
  readonly name: string;
  readonly ms: number;
}

/** An opening or closing tag of a suite or a test; a quoted attribute may hold a `>`. */
const TAG = /<(\/?)(testsuite|testcase)\b((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
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
  const plain = text.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const suites: (string | undefined)[] = [];
  const tests: TestTime[] = [];
  for (const [, closing, element, attributes = "", empty] of plain.matchAll(TAG)) {
    if (element === "testcase") {
      const suiteFile = suites.findLast((file) => file !== undefined);
      const test = closing === "/" ? undefined : testOf(attributes, suiteFile, root);
      if (test !== undefined) tests.push(test);
    } else if (closing === "/") suites.pop();
    else if (empty !== "/") suites.push(attributeOf(attributes, "file"));
  }
  return tests;
}

/** The tests over `maxMs`, the longest first; those that take the same keep their order. */
export function slowTests(tests: readonly TestTime[], maxMs: number): readonly TestTime[] {
  return tests.filter((test) => test.ms > maxMs).toSorted((a, b) => b.ms - a.ms);
}

/** The test a `<testcase>` with these attributes describes, or none without a name or a time. */
function testOf(
  attributes: string,
  suiteFile: string | undefined,
  root: string,
): TestTime | undefined {
  const name = attributeOf(attributes, "name");
  const time = attributeOf(attributes, "time")?.trim() ?? "";
  const seconds = time === "" ? Number.NaN : Number(time);
  if (name === undefined || !Number.isFinite(seconds)) return undefined;
  const ms = Math.round(seconds * 1000);
  const file = attributeOf(attributes, "file") ?? suiteFile ?? attributeOf(attributes, "classname");
  return file === undefined || file === ""
    ? { name, ms }
    : { path: fromRoot(file, root), name, ms };
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
