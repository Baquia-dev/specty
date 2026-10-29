// SPDX-License-Identifier: Apache-2.0
import { sampleRecords } from "./fixtures";
import { ActionError } from "./records";
import { sampleTrace, sampleTraceFiles } from "./sample-trace";

const ID = "20261018-asistencia-curso";
const records = () => sampleRecords(Date.now());

describe("the prototype's traceability", () => {
  it("AC4: lists the files of the sample diffs of «Panel de asistencia por curso»", async () => {
    expect(await sampleTraceFiles(records(), ID)).toEqual([
      "lib/attendance/attendance_repository.dart",
      "test/attendance/attendance_repository_test.dart",
      "lib/attendance/course_panel.dart",
      "test/attendance/course_panel_test.dart",
    ]);
  });

  it("AC4: traces what each task added to its commit, task and criteria, and the rest to an earlier commit", async () => {
    const panel = await sampleTrace(records(), ID, "lib/attendance/course_panel.dart");
    expect(panel.path).toBe("lib/attendance/course_panel.dart");
    expect(panel.commit).toBe("8b0a4f6");
    expect(panel.lines.length).toBeGreaterThan(5);
    // A file the task added is its own, whole.
    expect(panel.blocks).toEqual([
      {
        start: 1,
        end: panel.lines.length,
        commit: expect.objectContaining({
          commit: "8b0a4f6",
          change: expect.objectContaining({
            id: ID,
            task: { id: "T2", title: "Panel con estudiantes destacados" },
            criteria: [
              expect.objectContaining({ id: "AC1" }),
              expect.objectContaining({ id: "AC2" }),
            ],
          }),
        }),
      },
    ]);

    const repository = await sampleTrace(
      records(),
      ID,
      "lib/attendance/attendance_repository.dart",
    );
    const owners = repository.blocks.map((block) => block.commit.change?.task?.id ?? "outside");
    expect(owners).toContain("T1");
    expect(owners).toContain("outside");
    // The blocks cover every line, in order and without gaps.
    expect(repository.blocks[0]?.start).toBe(1);
    expect(repository.blocks.at(-1)?.end).toBe(repository.lines.length);
    repository.blocks.slice(1).forEach((block, index) => {
      expect(block.start).toBe((repository.blocks[index]?.end ?? 0) + 1);
    });
    const outside = repository.blocks.find((block) => block.commit.change === undefined);
    expect(outside?.commit).toMatchObject({ commit: "5d2a7b0", subject: expect.any(String) });
  });

  it("AC4: a change without sample diffs has no commits, and a file outside the change is refused", async () => {
    await expect(sampleTraceFiles(records(), "20261015-redondeo-promedios")).rejects.toBeInstanceOf(
      ActionError,
    );
    await expect(sampleTrace(records(), ID, "lib/otro.dart")).rejects.toBeInstanceOf(ActionError);
  });
});
