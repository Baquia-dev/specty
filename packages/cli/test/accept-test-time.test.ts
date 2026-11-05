// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { CONFIG, cli, APP as FILES, inWorktree, person, toAcceptance } from "./support";

/** The full verification copies it to `reports/junit.xml`, the report `checks.testTime` names. */
const FIXTURE = "fixture.xml";
const FULL = `mkdir -p reports && cp ${FIXTURE} reports/junit.xml`;
const TEST_TIME = 'checks:\n  testTime: { reports: ["reports/junit.xml"], maxMs: 1000 }\n';

/** A JUnit report of `test/a.test.ts` whose tests take `seconds` each. */
const junit = (seconds: readonly number[]) =>
  [
    "<testsuites>",
    '  <testsuite name="test/a.test.ts">',
    ...seconds.map(
      (time, index) =>
        `    <testcase classname="test/a.test.ts" name="a &gt; t${index + 1}" time="${time}"/>`,
    ),
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");

/** SPEC's change in acceptance, whose full verification leaves `report` as its JUnit report. */
async function inAcceptance(report: string): Promise<string> {
  const { folder } = await inWorktree({
    ...FILES,
    ".gitignore": "reports/\n",
    [FIXTURE]: report,
    ".specty/config.yaml": `${CONFIG()}  full: ${JSON.stringify(FULL)}\n${TEST_TIME}`,
  });
  await toAcceptance(folder);
  return folder;
}

/** Runs the full verification and stops before accepting: the note it left. */
async function verifyWithoutAccepting(folder: string): Promise<string> {
  const terminal = person({ confirm: [true, false] });
  await cli(folder, ["accept"], { terminal });
  const note = terminal.notes.find((text) => text.startsWith("Verificación correcta"));
  expect(note).toBeDefined();
  return note ?? "";
}

describe("the note of the full verification of `accept` shows the slow tests", () => {
  it("AC4: the five slowest with their file, name and time, and how many more there are", async () => {
    const folder = await inAcceptance(junit([2, 7, 1.5, 6, 5, 0.2, 4, 3]));
    const note = await verifyWithoutAccepting(folder);
    expect(note).toContain(
      [
        "7 tests tardan más de 1 s:",
        "test/a.test.ts «a > t2»: 7 s",
        "test/a.test.ts «a > t4»: 6 s",
        "test/a.test.ts «a > t5»: 5 s",
        "test/a.test.ts «a > t7»: 4 s",
        "test/a.test.ts «a > t8»: 3 s",
        "Otros 2 tests lentos.",
      ].join("\n"),
    );
    expect(note).not.toContain("«a > t1»");
    expect(note).not.toContain("«a > t6»");
  });

  it("AC4: without slow tests, the note says nothing of them", async () => {
    const folder = await inAcceptance(junit([0.2, 0.9]));
    const note = await verifyWithoutAccepting(folder);
    expect(note).not.toContain("tarda");
    expect(note).not.toContain("lento");
  });
});
