// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { type Coverage, changedCoverage, parseCoverage } from "../../src";

/** A report's lines as plain objects, to compare them whole. */
const plain = (coverage: Coverage) =>
  Object.fromEntries([...coverage].map(([path, lines]) => [path, Object.fromEntries(lines)]));

describe("the coverage reports Specty reads", () => {
  it("AC2: LCOV, with absolute paths inside the root made relative", () => {
    const lcov = [
      "TN:",
      "SF:/repo/src/a.ts",
      "FN:1,f",
      "DA:1,1",
      "DA:2,0",
      "DA:3,4",
      "end_of_record",
      "SF:src/b.ts",
      "DA:5,0",
      "end_of_record",
      "",
    ].join("\n");
    expect(plain(parseCoverage(lcov, "/repo"))).toEqual({
      "src/a.ts": { 1: true, 2: false, 3: true },
      "src/b.ts": { 5: false },
    });
  });

  it("AC2: Cobertura, with its source folder in front of each file", () => {
    const xml = [
      '<?xml version="1.0" ?>',
      '<coverage version="7.4" line-rate="0.5">',
      "  <sources>",
      "    <source>/repo/app</source>",
      "  </sources>",
      "  <packages>",
      '    <package name="pkg" line-rate="0.5">',
      "      <classes>",
      '        <class name="mod.py" filename="pkg/mod.py" line-rate="0.5">',
      "          <methods/>",
      "          <lines>",
      '            <line number="1" hits="1"/>',
      '            <line hits="0" number="2" branch="true" condition-coverage="0% (0/2)"/>',
      "          </lines>",
      "        </class>",
      "      </classes>",
      "    </package>",
      "  </packages>",
      "</coverage>",
    ].join("\n");
    expect(plain(parseCoverage(xml, "/repo"))).toEqual({ "app/pkg/mod.py": { 1: true, 2: false } });
    // A source outside the root leaves the file as the report names it.
    const elsewhere = xml.replace("/repo/app", "/ci/build/app");
    expect(plain(parseCoverage(elsewhere, "/repo"))).toEqual({
      "pkg/mod.py": { 1: true, 2: false },
    });
  });

  it("AC2: JaCoCo, a line covered when some instruction on it ran", () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<!DOCTYPE report PUBLIC "-//JACOCO//DTD Report 1.1//EN" "report.dtd">',
      '<report name="app">',
      '  <package name="com/acme">',
      '    <class name="com/acme/A" sourcefilename="A.java"/>',
      '    <sourcefile name="A.java">',
      '      <line nr="3" mi="0" ci="2" mb="0" cb="0"/>',
      '      <line nr="4" mi="3" ci="0" mb="0" cb="0"/>',
      "    </sourcefile>",
      "  </package>",
      "</report>",
    ].join("\n");
    expect(plain(parseCoverage(xml, "/repo"))).toEqual({
      "com/acme/A.java": { 3: true, 4: false },
    });
  });

  it("AC2: a Go profile, a line covered when some block that holds it ran", () => {
    const profile = [
      "mode: set",
      "github.com/acme/app/pkg/x.go:3.14,5.2 2 1",
      "github.com/acme/app/pkg/x.go:7.10,9.3 1 0",
      "github.com/acme/app/pkg/x.go:9.3,10.2 1 1",
      "",
    ].join("\n");
    expect(plain(parseCoverage(profile, "/repo"))).toEqual({
      "github.com/acme/app/pkg/x.go": {
        3: true,
        4: true,
        5: true,
        7: false,
        8: false,
        9: true,
        10: true,
      },
    });
  });

  it("AC2: anything else is no report", () => {
    expect(parseCoverage("not a coverage report\n", "/repo").size).toBe(0);
    expect(parseCoverage("", "/repo").size).toBe(0);
  });
});

describe("the coverage of the lines a change adds", () => {
  const report = (path: string, lines: Record<number, boolean>): Coverage =>
    new Map([[path, new Map(Object.entries(lines).map(([line, run]) => [Number(line), run]))]]);

  it("AC1: counts the measured lines the change adds and groups the uncovered ones", () => {
    const coverage = report("src/a.ts", {
      1: true,
      2: false,
      4: false,
      6: true,
      7: false,
      9: true,
    });
    // Line 3 is not measured (a comment, say), so 2 and 4 make one stretch; 6 breaks it.
    const result = changedCoverage(
      [coverage],
      [{ path: "src/a.ts", lines: new Set([2, 3, 4, 6, 7]) }],
    );
    expect(result).toEqual({
      measured: 4,
      covered: 1,
      gaps: [
        { path: "src/a.ts", from: 2, to: 4 },
        { path: "src/a.ts", from: 7, to: 7 },
      ],
    });
    // A new file, or `--all`, counts every measured line.
    expect(changedCoverage([coverage], [{ path: "src/a.ts" }])).toMatchObject({
      measured: 6,
      covered: 3,
    });
  });

  it("AC2: matches a file the report names from another root, by the longest end of its path", () => {
    const go = report("github.com/acme/app/pkg/x.go", { 3: true, 4: false });
    const java = new Map([
      ["A.java", new Map([[3, false]])],
      ["com/acme/A.java", new Map([[3, true]])],
    ]);
    const other = report("/other/checkout/src/a.ts", { 1: false });
    const result = changedCoverage(
      [go, java, other],
      [
        { path: "pkg/x.go", lines: new Set([3, 4]) },
        { path: "src/main/java/com/acme/A.java", lines: new Set([3]) },
        { path: "src/a.ts", lines: new Set([1]) },
        { path: "src/unmeasured.ts", lines: new Set([1, 2]) },
      ],
    );
    expect(result).toEqual({
      measured: 4,
      covered: 2,
      gaps: [
        { path: "pkg/x.go", from: 4, to: 4 },
        { path: "src/a.ts", from: 1, to: 1 },
      ],
    });
  });

  it("AC1: a line covered in one of several reports counts as covered", () => {
    const first = report("src/a.ts", { 1: false, 2: false });
    const second = report("src/a.ts", { 1: true });
    expect(changedCoverage([first, second], [{ path: "src/a.ts" }])).toEqual({
      measured: 2,
      covered: 1,
      gaps: [{ path: "src/a.ts", from: 2, to: 2 }],
    });
  });
});
