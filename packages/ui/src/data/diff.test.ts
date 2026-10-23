// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type DiffLine, parseDiff, splitRows } from "./diff";
import { FixtureData, sampleRecords } from "./fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "./records";
import { deriveViews } from "./views";

const ASISTENCIA = "20261018-asistencia-curso";

/** A source with nothing of its own: it gives no diffs. */
@Injectable()
class Bare extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
}

function source(): FixtureData {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [FixtureData] });
  return TestBed.inject(FixtureData);
}

const MODIFIED = [
  "diff --git a/lib/attendance/attendance_repository.dart b/lib/attendance/attendance_repository.dart",
  "index 4b1e2a0..9c3d7f1 100644",
  "--- a/lib/attendance/attendance_repository.dart",
  "+++ b/lib/attendance/attendance_repository.dart",
  "@@ -1,3 +1,4 @@",
  " import 'package:sqflite/sqflite.dart';",
  "-import 'attendance_record.dart';",
  "+import 'attendance_record.dart';",
  "+import 'week.dart';",
  " ",
  "@@ -10,3 +11,3 @@ class AttendanceRepository {",
  "   Future<List<AttendanceRecord>> recordsFor(String courseId) async {",
  "-    expect(await repo.recordsFor('5A'), hasLength(12));",
  "+    expect(await repo.recordsFor('5A'), hasLength(14));",
  "   }",
].join("\n");

const OTHERS = [
  "diff --git a/lib/attendance/course_panel.dart b/lib/attendance/course_panel.dart",
  "new file mode 100644",
  "index 0000000..3f2a1b4",
  "--- /dev/null",
  "+++ b/lib/attendance/course_panel.dart",
  "@@ -0,0 +1,2 @@",
  "+class CoursePanel {}",
  "+",
  "\\ No newline at end of file",
  "diff --git a/lib/old.dart b/lib/old.dart",
  "deleted file mode 100644",
  "--- a/lib/old.dart",
  "+++ /dev/null",
  "@@ -1 +0,0 @@",
  "-// Gone.",
  "diff --git a/lib/a.dart b/lib/b.dart",
  "similarity index 90%",
  "rename from lib/a.dart",
  "rename to lib/b.dart",
  "@@ -2 +2 @@",
  "-const name = 'a';",
  "+const name = 'b';",
  "diff --git a/assets/logo.png b/assets/logo.png",
  "Binary files a/assets/logo.png and b/assets/logo.png differ",
  'diff --git "a/docs/caf\\"e notes.md" "b/docs/caf\\"e notes.md"',
  '--- a/docs/caf"e notes.md',
  '+++ b/docs/caf"e notes.md',
  "@@ -1 +1 @@",
  "-Antes",
  "+Después",
].join("\r\n");

const kinds = (lines: readonly DiffLine[]) =>
  lines.map((line) => [line.kind, line.oldNumber ?? null, line.newNumber ?? null, line.text]);

describe("parseDiff", () => {
  it("reads a modified file: its hunks, their section and each side's numbers (AC2)", () => {
    const [file, ...rest] = parseDiff(MODIFIED);
    expect(rest).toEqual([]);
    expect(file).toMatchObject({
      path: "lib/attendance/attendance_repository.dart",
      status: "modified",
      binary: false,
      additions: 3,
      deletions: 2,
    });
    expect(file?.oldPath).toBeUndefined();
    const [first, second] = file?.hunks ?? [];
    expect(first).toMatchObject({
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 4,
      section: "",
    });
    expect(kinds(first?.lines ?? [])).toEqual([
      ["context", 1, 1, "import 'package:sqflite/sqflite.dart';"],
      ["removed", 2, null, "import 'attendance_record.dart';"],
      ["added", null, 2, "import 'attendance_record.dart';"],
      ["added", null, 3, "import 'week.dart';"],
      ["context", 3, 4, ""],
    ]);
    expect(second?.section).toBe("class AttendanceRepository {");
    expect(kinds(second?.lines ?? []).map((line) => line.slice(0, 3))).toEqual([
      ["context", 10, 11],
      ["removed", 11, null],
      ["added", null, 12],
      ["context", 12, 13],
    ]);
  });

  it("knows new, deleted, renamed and binary files, and quoted paths (AC2)", () => {
    const files = parseDiff(OTHERS);
    expect(files.map((file) => [file.path, file.status, file.binary])).toEqual([
      ["lib/attendance/course_panel.dart", "added", false],
      ["lib/old.dart", "deleted", false],
      ["lib/b.dart", "renamed", false],
      ["assets/logo.png", "modified", true],
      ['docs/caf"e notes.md', "modified", false],
    ]);
    const [added, deleted, renamed, binary] = files;
    expect(kinds(added?.hunks[0]?.lines ?? [])).toEqual([
      ["added", null, 1, "class CoursePanel {}"],
      ["added", null, 2, ""],
    ]);
    expect([deleted?.additions, deleted?.deletions]).toEqual([0, 1]);
    expect(deleted?.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 1, newStart: 0, newLines: 0 });
    expect(renamed?.oldPath).toBe("lib/a.dart");
    expect(binary?.hunks).toEqual([]);
  });

  it("marks the words that changed between similar lines only (AC3)", () => {
    const [file] = parseDiff(MODIFIED);
    const [removed, added] = (file?.hunks[1]?.lines ?? []).slice(1, 3);
    const marked = (line: DiffLine | undefined) =>
      (line?.changed ?? []).map((range) => line?.text.slice(range.start, range.end));
    expect(marked(removed)).toEqual(["12"]);
    expect(marked(added)).toEqual(["14"]);
    // The same import, and then a new one: only the pair is compared, and it did not change.
    const first = file?.hunks[0]?.lines ?? [];
    expect(first[1]?.changed).toEqual([]);
    expect(first[3]?.changed).toBeUndefined();
    // Lines that share too little show whole.
    const [unlike] = parseDiff(
      ["diff --git a/x b/x", "@@ -1 +1 @@", "-return a;", "+throw StateError('no');"].join("\n"),
    );
    expect(unlike?.hunks[0]?.lines.map((line) => line.changed)).toEqual([undefined, undefined]);
  });

  it("skips what it does not understand and reads the rest (AC4)", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("warning: something\nnot a diff")).toEqual([]);
    const files = parseDiff(
      [
        "commit 1234567",
        "diff --git a/a.txt b/a.txt",
        "@@ -1 +1 @@",
        "-uno",
        "+dos",
        "garbage after the hunk",
        "@@ nonsense @@",
        "diff --git a/b.txt b/b.txt",
        "@@ -1,2 +1 @@",
        " igual",
        "-quitada",
      ].join("\n"),
    );
    expect(files.map((file) => [file.path, file.additions, file.deletions])).toEqual([
      ["a.txt", 1, 1],
      ["b.txt", 0, 1],
    ]);
  });
});

describe("splitRows", () => {
  it("pairs each run of removed lines with the added run after it; the rest stands alone (AC3)", () => {
    const [file] = parseDiff(MODIFIED);
    const rows = splitRows(
      file?.hunks[0] ?? {
        oldStart: 0,
        oldLines: 0,
        newStart: 0,
        newLines: 0,
        section: "",
        lines: [],
      },
    );
    expect(rows.map((row) => [row.left?.oldNumber ?? null, row.right?.newNumber ?? null])).toEqual([
      [1, 1],
      [2, 2],
      [null, 3],
      [3, 4],
    ]);
    const [deleted] = parseDiff(["diff --git a/x b/x", "@@ -1,2 +0,0 @@", "-a", "-b"].join("\n"));
    expect(
      splitRows(
        deleted?.hunks[0] ?? {
          oldStart: 0,
          oldLines: 0,
          newStart: 0,
          newLines: 0,
          section: "",
          lines: [],
        },
      ).map((row) => row.right),
    ).toEqual([undefined, undefined]);
  });
});

describe("the diffs in the source", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("gives each task's diff and the whole change's, as git writes them (AC1)", async () => {
    const fixtures = source();
    const files = async (task?: string) =>
      parseDiff(await fixtures.diff(ASISTENCIA, task)).map((file) => [
        file.path,
        file.status,
        file.additions,
        file.deletions,
      ]);
    expect(await files("T1")).toEqual([
      ["lib/attendance/attendance_repository.dart", "modified", 24, 1],
      ["test/attendance/attendance_repository_test.dart", "modified", 11, 1],
    ]);
    expect(await files("T2")).toEqual([
      ["lib/attendance/course_panel.dart", "added", 44, 0],
      ["test/attendance/course_panel_test.dart", "added", 19, 0],
    ]);
    expect((await files()).map(([path]) => path)).toEqual([
      "lib/attendance/attendance_repository.dart",
      "test/attendance/attendance_repository_test.dart",
      "lib/attendance/course_panel.dart",
      "test/attendance/course_panel_test.dart",
    ]);
    // The new argument of the query is the only thing marked in its line.
    const [repository] = parseDiff(await fixtures.diff(ASISTENCIA, "T1"));
    const added = repository?.hunks[1]?.lines.find((line) => line.kind === "added");
    expect(
      (added?.changed ?? []).map((range) => added?.text.slice(range.start, range.end)),
    ).toEqual([", orderBy: 'date'"]);
  });

  it("has nothing for a change without sample diffs, and explains what it cannot give (AC1)", async () => {
    const fixtures = source();
    expect(await fixtures.diff("20261019-boletines-pdf", "T1")).toBe("");
    await expect(fixtures.diff("20990101-no-existe")).rejects.toBeInstanceOf(ActionError);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [Bare] });
    await expect(TestBed.inject(Bare).diff(ASISTENCIA)).rejects.toMatchObject({
      text: { es: "Esta fuente no da diffs." },
    });
  });

  it("knows the commits each task went from and to (AC5)", () => {
    const view = deriveViews(sampleRecords(Date.now())).find((item) => item.id === ASISTENCIA);
    expect(view?.progress.tasks.map((task) => [task.id, task.baseCommit, task.commit])).toEqual([
      ["T1", "5d2a7b0", "3c9d1e2"],
      ["T2", "3c9d1e2", "8b0a4f6"],
    ]);
  });
});
