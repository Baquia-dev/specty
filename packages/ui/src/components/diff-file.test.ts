// SPDX-License-Identifier: Apache-2.0
import { parseDiff } from "../data/diff";
import { sampleDiff } from "../data/sample-diffs";
import { countsLabel, firstLines, spansOf } from "./diff-file";

describe("Diff lines", () => {
  it("cuts a line into the words that changed and the rest", () => {
    const line = {
      kind: "added",
      text: "hasLength(14));",
      changed: [{ start: 10, end: 12 }],
    } as const;
    expect(spansOf(line)).toEqual([
      { text: "hasLength(", changed: false },
      { text: "14", changed: true },
      { text: "));", changed: false },
    ]);
    expect(spansOf({ kind: "context", text: "" })).toEqual([{ text: "", changed: false }]);
    expect(spansOf({ kind: "added", text: "all", changed: [{ start: 0, end: 3 }] })).toEqual([
      { text: "all", changed: true },
    ]);
  });

  it("keeps the first lines across hunks", () => {
    const [file] = parseDiff(sampleDiff("20261018-asistencia-curso", "T1"));
    const { hunks, hidden } = firstLines(file?.hunks ?? [], 10);
    expect(hunks.map((hunk) => hunk.lines.length)).toEqual([7, 3]);
    expect(hidden).toBe(25);
  });

  it("counts lines in words", () => {
    expect(countsLabel(1, 0, "es")).toBe("1 añadida, 0 quitadas");
    expect(countsLabel(2, 1, "en")).toBe("2 added, 1 removed");
  });
});
