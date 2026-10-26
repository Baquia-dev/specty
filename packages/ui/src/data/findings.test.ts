// SPDX-License-Identifier: Apache-2.0
import { findingsOf } from "./findings";
import type { AuditRecord } from "./progress";

const completed = (task: string, data: Readonly<Record<string, unknown>>): AuditRecord => ({
  ts: "2026-10-24T10:00:00Z",
  actor: "agent",
  event: "task.completed",
  data: { task, ...data },
});

describe("findingsOf", () => {
  it("gives what each task learned, in the order the tasks were completed (AC1)", () => {
    expect(
      findingsOf([
        completed("T1", { findings: ["La caché no se invalida.", 3, ""] }),
        completed("T2", {}),
        completed("T3", { findings: ["Falta un índice."] }),
      ]),
    ).toEqual([
      { task: "T1", text: "La caché no se invalida." },
      { task: "T3", text: "Falta un índice." },
    ]);
  });

  it("counts only each task's last completion (AC1)", () => {
    const first = completed("T1", { findings: ["Antes."] });
    expect(findingsOf([first, completed("T1", { findings: ["Después."] })])).toEqual([
      { task: "T1", text: "Después." },
    ]);
    expect(findingsOf([first, completed("T1", {})])).toEqual([]);
    expect(findingsOf([])).toEqual([]);
  });
});
