// SPDX-License-Identifier: Apache-2.0
import { ActionError } from "./records";
import { ServerData } from "./server";
import type { TraceRecord } from "./trace";

const ID = "20261018-asistencia-curso";

const TRACE: TraceRecord = {
  path: "lib/attendance/course_panel.dart",
  commit: "8b0a4f6",
  lines: ["import 'package:flutter/widgets.dart';", "", "class CoursePanel {}"],
  blocks: [
    {
      start: 1,
      end: 3,
      commit: {
        commit: "8b0a4f6",
        date: "2026-10-18",
        author: "Ana Gómez",
        subject: "feat(attendance): Panel con estudiantes destacados",
        change: {
          id: ID,
          title: "Panel de asistencia por curso",
          task: { id: "T2", title: "Panel con estudiantes destacados" },
          criteria: [{ id: "AC1", text: "CUANDO el coordinador abre el panel ENTONCES lo ve." }],
        },
      },
    },
  ],
};

/** `fetch` answering every request with `status` and `body` as JSON. */
function answering(status: number, body: unknown) {
  const fetched = vi.fn((_url: string) =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetched);
  return fetched;
}

/** Why the read failed, in Spanish. */
async function reason(read: Promise<unknown>): Promise<string> {
  const error: unknown = await read.catch((caught: unknown) => caught);
  if (!(error instanceof ActionError)) throw new Error("the read did not fail with its reason");
  return error.text.es;
}

describe("the traceability from the local server", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("AC3: reads the files the change left, and a file's blocks", async () => {
    const listed = answering(200, { files: ["lib/a.dart", "test/a_test.dart"] });
    expect(await new ServerData().traceFiles(ID)).toEqual(["lib/a.dart", "test/a_test.dart"]);
    expect(listed).toHaveBeenCalledWith(`/api/changes/${ID}/trace`);

    const asked = answering(200, TRACE);
    expect(await new ServerData().trace(ID, TRACE.path)).toEqual(TRACE);
    expect(asked).toHaveBeenCalledWith(
      `/api/changes/${ID}/trace?path=lib%2Fattendance%2Fcourse_panel.dart`,
    );
  });

  it("AC3: explains a missing session, no commits, a file too large, an error and unexpected data", async () => {
    answering(403, { error: "forbidden" });
    expect(await reason(new ServerData().traceFiles(ID))).toBe(
      "Esta pestaña no tiene sesión: abre el enlace que imprime `specty ui`.",
    );
    answering(404, { error: "not found" });
    expect(await reason(new ServerData().traceFiles(ID))).toContain("aún no tiene commits");
    answering(413, { error: "too large" });
    expect(await reason(new ServerData().trace(ID, "lib/a.dart"))).toContain("specty why");
    answering(500, { error: "git" });
    expect(await reason(new ServerData().trace(ID, "lib/a.dart"))).toBe(
      "El servidor respondió 500.",
    );
    answering(200, { files: [1, 2] });
    expect(await reason(new ServerData().traceFiles(ID))).toBe(
      "El servidor devolvió datos inesperados.",
    );
    answering(200, { path: "lib/a.dart", lines: "no" });
    expect(await reason(new ServerData().trace(ID, "lib/a.dart"))).toBe(
      "El servidor devolvió datos inesperados.",
    );
  });
});
