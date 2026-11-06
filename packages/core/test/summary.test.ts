// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type ChangeState,
  ChangeStateSchema,
  initialTab,
  PHASES,
  type Phase,
  parseSpec,
  type SummarySource,
  summarizeChange,
} from "../src";

const ID = "20261024-saludo-personalizado";
const SINCE = "2026-10-24T12:00:00.000Z";

const BASE = ChangeStateSchema.parse({
  schema: 1,
  id: ID,
  kind: "standard",
  phase: "implementing",
  branch: `specty/${ID}`,
  baseCommit: "9f1c2e7",
  revision: 1,
  items: {},
  tasks: {
    T1: {
      status: "done",
      baseCommit: "9f1c2e7",
      commit: "a1b2c3d",
      attempts: 1,
      summary: "Saluda por nombre",
      scopeExtra: [],
    },
    T2: { status: "active", baseCommit: "a1b2c3d", attempts: 0, scopeExtra: [] },
  },
  pending: { scopeRequests: [], adjustment: null },
  maxIds: { A: 0, AC: 1, T: 2, R: 0 },
});

/** A spec with its frontmatter's extra lines, its title and its sections, as written. */
function specText(front: readonly string[], title: string, body: readonly string[] = []): string {
  return ["---", "kind: standard", ...front, "---", "", `# ${title}`, "", ...body, ""].join("\n");
}

const TASKS = [
  "## Archivos",
  "",
  "- modificar packages/api/src/app.ts — saluda por nombre",
  "- modificar packages/web/src/page.ts — muestra el saludo",
  "",
  "## Tareas",
  "",
  "- [x] T1: Saludar por nombre",
  "  - files: packages/api/src/app.ts",
  "  - ac: AC1",
  "- [ ] T2: Mostrar el saludo",
  "  - files: packages/web/src/page.ts",
  "  - ac: AC1",
];

/** The summary of a change with `text` as its spec, `state` and `audit`. */
function summary(
  text: string,
  state: Partial<ChangeState> = {},
  audit: SummarySource["audit"] = [],
): ReturnType<typeof summarizeChange> {
  return summarizeChange({
    spec: parseSpec(text).spec,
    state: { ...BASE, ...state },
    phaseSince: SINCE,
    audit,
  });
}

const line = (ts: string, event: string) => ({ ts, actor: "agent", event, data: {} });

describe("the summary of a change", () => {
  it("AC1: gives its id, title, kind, phase, size with its reasons in both languages, tasks and tab", () => {
    const audit = [
      line("2026-10-24T09:00:00.000Z", "spec.proposed"),
      line("2026-10-24T10:00:00.000Z", "change.created"),
    ];
    expect(summary(specText([], "Saludo personalizado", TASKS), {}, audit)).toEqual({
      id: ID,
      title: "Saludo personalizado",
      kind: "standard",
      phase: "implementing",
      phaseSince: SINCE,
      createdAt: "2026-10-24T10:00:00.000Z",
      size: {
        level: "S",
        reasons: [
          { es: "2 archivos", en: "2 files" },
          { es: "2 módulos", en: "2 modules" },
        ],
      },
      tasks: { done: 1, total: 2 },
      tab: "progress",
    });
  });

  it("AC1: takes the id as its title, and its epic and slice from the frontmatter", () => {
    const slice = summary(specText(["epic: 20261020-panel", "slice: C2"], ""));
    expect([slice.title, slice.epic]).toEqual([ID, { id: "20261020-panel", slice: "C2" }]);
    expect(summary(specText(["epic: 20261020-panel"], "Sin corte")).epic).toEqual({
      id: "20261020-panel",
    });
    expect(summary(specText([], "Sin épica"))).not.toHaveProperty("epic");
  });

  it("AC1: gives an epic's slices by their id and title, and none without them", () => {
    const epic = [
      "---",
      "kind: epic",
      "---",
      "",
      "# Panel académico",
      "",
      "## Cortes",
      "",
      "- C1: Asistencia por curso",
      "  - ac: AC1",
      "- C2: Notas del trimestre",
      "  - ac: AC1",
      "  - depends: C1",
      "",
    ].join("\n");
    expect(summary(epic, { kind: "epic" }).slices).toEqual([
      { id: "C1", title: "Asistencia por curso" },
      { id: "C2", title: "Notas del trimestre" },
    ]);
    expect(summary(specText([], "Sin cortes"))).not.toHaveProperty("slices");
  });

  it("AC1: begins at its change.created, or else at its first line with a time, or else at phaseSince", () => {
    const created = (audit: SummarySource["audit"]) =>
      summary(specText([], "Saludo"), {}, audit).createdAt;
    const unread = ["not a line", null, { event: "change.created" }];
    expect(created([...unread, line("2026-10-24T09:30:00.000Z", "spec.proposed")])).toBe(
      "2026-10-24T09:30:00.000Z",
    );
    // A line with a time and no event still counts as the first one.
    expect(created([{ ts: "2026-10-24T09:10:00.000Z" }, line(SINCE, "spec.proposed")])).toBe(
      "2026-10-24T09:10:00.000Z",
    );
    expect(created(unread)).toBe(SINCE);
    expect(created([])).toBe(SINCE);
  });

  it("AC1: finishes only when done or cancelled, at the last entry that finished it or else at phaseSince", () => {
    const audit = [
      line("2026-10-24T10:00:00.000Z", "change.created"),
      line("2026-10-24T11:00:00.000Z", "change.accepted"),
      line("2026-10-24T11:30:00.000Z", "change.closed"),
      line("2026-10-24T11:45:00.000Z", "memory.added"),
    ];
    const finished = (phase: Phase, lines: SummarySource["audit"]) =>
      summary(specText([], "Saludo"), { phase }, lines);
    expect(finished("done", audit).closedAt).toBe("2026-10-24T11:30:00.000Z");
    expect(
      finished("done", [...audit, line("2026-10-24T12:00:00.000Z", "retro.confirmed")]),
    ).toMatchObject({
      createdAt: "2026-10-24T10:00:00.000Z",
      closedAt: "2026-10-24T12:00:00.000Z",
    });
    expect(
      finished("cancelled", [
        line("2026-10-24T10:00:00.000Z", "change.created"),
        line("2026-10-24T10:20:00.000Z", "change.cancelled"),
      ]).closedAt,
    ).toBe("2026-10-24T10:20:00.000Z");
    expect(finished("done", [line("2026-10-24T10:00:00.000Z", "change.created")]).closedAt).toBe(
      SINCE,
    );
    expect(finished("closing", audit)).not.toHaveProperty("closedAt");
  });

  it("AC1: keeps the size level of its state, with the reasons its spec gives", () => {
    const sized = summary(specText([], "Saludo", TASKS), {
      size: { level: "XL", score: 30, adjust: 0, reasons: [] },
    });
    expect(sized.size).toEqual({
      level: "XL",
      reasons: [
        { es: "2 archivos", en: "2 files" },
        { es: "2 módulos", en: "2 modules" },
      ],
    });
  });

  it("AC1: opens each phase on its tab", () => {
    expect(Object.fromEntries(PHASES.map((phase) => [phase, initialTab(phase)]))).toEqual({
      draft: "spec",
      review: "spec",
      testing: "progress",
      implementing: "progress",
      adjusting: "progress",
      acceptance: "acceptance",
      closing: "acceptance",
      done: "history",
      cancelled: "history",
    });
    expect(summary(specText([], "Saludo"), { phase: "done" }).tab).toBe("history");
  });
});
