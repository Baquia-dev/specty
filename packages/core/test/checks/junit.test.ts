// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { parseJunit, parseJunitFailures, resolveConfig, slowTests } from "../../src";

/** What Vitest's `junit` reporter writes: the classname is the file, relative to its root. */
const VITEST = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="0" errors="0" time="4.1">
  <testsuite name="test/sum.test.ts" timestamp="2026-11-05T10:00:00.000Z" hostname="host" tests="3" failures="0" errors="0" skipped="0" time="4.1">
    <testcase classname="test/sum.test.ts" name="sum &gt; adds big numbers" time="1.5">
    </testcase>
    <testcase classname="test/sum.test.ts" name="sum &gt; adds &quot;many&quot; numbers" time="2.6">
      <system-out>
<![CDATA[<testcase classname="test/out.test.ts" name="printed" time="9">]]>
      </system-out>
    </testcase>
    <testcase classname="test/sum.test.ts" name="sum &gt; adds two numbers" time="0.004">
    </testcase>
  </testsuite>
</testsuites>
`;

describe("the JUnit reports Specty reads", () => {
  it("AC1: Vitest's, each test with its file, its name and its time in milliseconds", () => {
    expect(parseJunit(VITEST, "/repo")).toEqual([
      { path: "test/sum.test.ts", name: "sum > adds big numbers", ms: 1500 },
      { path: "test/sum.test.ts", name: 'sum > adds "many" numbers', ms: 2600 },
      { path: "test/sum.test.ts", name: "sum > adds two numbers", ms: 4 },
    ]);
  });

  it("AC1: the file of the test, else the one of its suite, else its classname", () => {
    const report = [
      "<testsuites>",
      '  <testsuite name="pytest" time="2.1">',
      '    <testcase classname="tests.test_api" name="test_login" file="tests/test_api.py" line="12" time="2.100" />',
      "  </testsuite>",
      '  <testsuite name="cart" file="spec/cart.spec.js" time="1.2">',
      '    <testcase classname="Cart" name="adds an item" time="1.2"/>',
      "  </testsuite>",
      '  <testsuite name="com.acme.CartTest" time="3.2">',
      '    <testcase name="addsItems" classname="com.acme.CartTest" time="3.2"/>',
      "  </testsuite>",
      "</testsuites>",
    ].join("\n");
    expect(parseJunit(report, "/repo")).toEqual([
      { path: "tests/test_api.py", name: "test_login", ms: 2100 },
      { path: "spec/cart.spec.js", name: "adds an item", ms: 1200 },
      { path: "com.acme.CartTest", name: "addsItems", ms: 3200 },
    ]);
  });

  it("AC1: leaves out a test without a time, and what a comment or CDATA holds", () => {
    const report = [
      '<testsuite name="s">',
      '  <!-- <testcase classname="a.test.ts" name="commented" time="5"/> -->',
      '  <testcase classname="a.test.ts" name="no time"/>',
      '  <testcase classname="a.test.ts" name="bad time" time="soon"/>',
      '  <testcase classname="a.test.ts" name="kept" time="0.25"/>',
      '  <system-err><![CDATA[ <testcase name="noise" time="7"/> ]]></system-err>',
      "</testsuite>",
    ].join("\n");
    expect(parseJunit(report, "/repo")).toEqual([{ path: "a.test.ts", name: "kept", ms: 250 }]);
    expect(parseJunit("not a report", "/repo")).toEqual([]);
  });

  it("AC2: an absolute path inside the root becomes relative to it; one outside stays", () => {
    const report = [
      "<testsuite>",
      '  <testcase classname="x" name="inside" file="/repo/packages/web/test/a.test.ts" time="1"/>',
      '  <testcase classname="/elsewhere/b.test.ts" name="outside" time="1"/>',
      "</testsuite>",
    ].join("\n");
    expect(parseJunit(report, "/repo")).toEqual([
      { path: "packages/web/test/a.test.ts", name: "inside", ms: 1000 },
      { path: "/elsewhere/b.test.ts", name: "outside", ms: 1000 },
    ]);
  });

  it("AC1: the slow tests are the ones over maxMs, the longest first", () => {
    const tests = parseJunit(VITEST, "/repo");
    expect(slowTests(tests, 1000)).toEqual([
      { path: "test/sum.test.ts", name: 'sum > adds "many" numbers', ms: 2600 },
      { path: "test/sum.test.ts", name: "sum > adds big numbers", ms: 1500 },
    ]);
    expect(slowTests(tests, 1500)).toEqual([
      { path: "test/sum.test.ts", name: 'sum > adds "many" numbers', ms: 2600 },
    ]);
    expect(slowTests(tests, 5000)).toEqual([]);
  });
});

describe("the tests that failed in a JUnit report", () => {
  it("AC4: each test whose testcase holds a failure or an error, with its file, also without a time", () => {
    const report = [
      "<testsuites>",
      '  <testsuite name="test/sum.test.ts" failures="1">',
      '    <testcase classname="test/sum.test.ts" name="sum &gt; adds" time="0.002">',
      "    </testcase>",
      '    <testcase classname="test/sum.test.ts" name="sum &gt; breaks" time="0.01">',
      '      <failure message="expected 1 to be 2 // Object.is equality" type="AssertionError">',
      "AssertionError: expected 1 to be 2 // Object.is equality",
      "      </failure>",
      "    </testcase>",
      "  </testsuite>",
      '  <testsuite name="pytest" file="tests/test_api.py">',
      '    <testcase classname="tests.test_api" name="test_login"><error message="boom"/></testcase>',
      '    <testcase classname="tests.test_api" name="test_later" time="0"><skipped/></testcase>',
      "  </testsuite>",
      '  <testcase classname="x" name="inside" file="/repo/packages/web/test/a.test.ts"><failure/></testcase>',
      "</testsuites>",
    ].join("\n");
    expect(parseJunitFailures(report, "/repo")).toEqual([
      { path: "test/sum.test.ts", name: "sum > breaks" },
      { path: "tests/test_api.py", name: "test_login" },
      { path: "packages/web/test/a.test.ts", name: "inside" },
    ]);
    expect(parseJunit(report, "/repo").map(({ name }) => name)).toEqual([
      "sum > adds",
      "sum > breaks",
      "test_later",
    ]);
  });

  it("AC4: leaves out the tests that passed or were skipped, and what a comment or CDATA holds", () => {
    const report = [
      '<testsuite name="s">',
      '  <!-- <testcase classname="a.test.ts" name="commented"><failure/></testcase> -->',
      '  <testcase classname="a.test.ts" name="printed" time="0.1">',
      '    <system-out><![CDATA[<failure message="not a failure"/>]]></system-out>',
      "    <system-err>a warning</system-err>",
      "  </testcase>",
      '  <testcase classname="a.test.ts" name="passed" time="0.1"/>',
      '  <testcase classname="a.test.ts" name="skipped" time="0"><skipped message="later"/></testcase>',
      '  <testcase classname="a.test.ts" name="rerun" time="0.1"><flakyFailure message="passed when run again"/></testcase>',
      '  <testcase name="without a file"><failure message="broken"/></testcase>',
      "</testsuite>",
    ].join("\n");
    expect(parseJunitFailures(report, "/repo")).toEqual([{ name: "without a file" }]);
    expect(parseJunitFailures("not a report", "/repo")).toEqual([]);
  });
});

describe("checks.testTime", () => {
  const configured = (checks: unknown) => {
    const result = resolveConfig({ version: 1, checks });
    return result.ok ? result.config.checks : undefined;
  };

  it("AC5: takes reports and maxMs, and leaves the check without them when the key is absent", () => {
    expect(configured({ testTime: { reports: ["reports/*.xml"], maxMs: 2000 } })).toMatchObject({
      testTime: { reports: ["reports/*.xml"], maxMs: 2000 },
    });
    expect(configured({})).not.toHaveProperty("testTime");
  });

  it("AC5: is not valid without reports or maxMs, or with a maxMs that is not a positive integer", () => {
    expect(configured({ testTime: { maxMs: 2000 } })).toBeUndefined();
    expect(configured({ testTime: { reports: ["reports/*.xml"] } })).toBeUndefined();
    expect(configured({ testTime: { reports: [], maxMs: 2000 } })).toBeUndefined();
    expect(configured({ testTime: { reports: ["reports/*.xml"], maxMs: 0 } })).toBeUndefined();
    expect(configured({ testTime: { reports: ["reports/*.xml"], maxMs: 1.5 } })).toBeUndefined();
    expect(configured({ testTime: { reports: ["reports/*.xml"], maxMs: "2s" } })).toBeUndefined();
  });
});
