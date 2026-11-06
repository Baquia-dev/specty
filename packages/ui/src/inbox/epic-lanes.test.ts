// SPDX-License-Identifier: Apache-2.0
import type { Phase } from "@baquia-dev/specty-core/light";
import { sampleRecords } from "../data/fixtures";
import type {
  ChangeRecord,
  ChangeTab,
  ChangeView,
  DecisionKind,
  ListedChange,
} from "../data/records";
import { deriveView, deriveViews } from "../data/views";
import {
  asksForSlices,
  epicLanes,
  epicTally,
  LANE_STEPS,
  laneCells,
  type SliceAnswer,
} from "./epic-lanes";

const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const EPIC_ID = "20261015-panel";
const VIEWS = deriveViews(sampleRecords(NOW));

/** The Cortes section of the epic: C2 and C5 wait for C1, and C4 for C2 and C3. */
const CORTES = [
  "## Cortes",
  "",
  "- C1: Asistencia por curso",
  "  - ac: AC1",
  "- C2: Avisos de calificaciones",
  "  - ac: AC1",
  "  - depends: C1",
  "- C3: Acceso con Google",
  "  - ac: AC1",
  "- C4: Chat entre docentes",
  "  - ac: AC1",
  "  - depends: C2, C3",
  "- C5: Recordatorios por correo",
  "  - ac: AC1",
  "  - depends: C1",
];

/** The epic «Panel académico», whole, in `phase`. */
function epicIn(phase: Phase): ChangeView {
  const base = sampleRecords(NOW)[0] ?? fail();
  const record: ChangeRecord = {
    spec: ["---", "kind: epic", "---", "", "# Panel académico", "", ...CORTES, ""].join("\n"),
    state: { ...base.state, id: EPIC_ID, kind: "epic", phase },
    phaseSince: new Date(NOW).toISOString(),
  };
  return deriveView(record);
}

const TABS: Readonly<Partial<Record<Phase, ChangeTab>>> = {
  testing: "progress",
  implementing: "progress",
  done: "history",
  cancelled: "history",
};

/** A change of the epic's slice `slice`, in `phase`, waiting for `decision` if given. */
function sliceChange(
  id: string,
  slice: string,
  phase: Phase,
  decision?: DecisionKind,
): ListedChange {
  const { decision: _decision, ...base } = VIEWS[0] ?? fail();
  return {
    ...base,
    id,
    title: `Cambio ${slice}`,
    phase,
    tab: TABS[phase] ?? "spec",
    epic: { id: EPIC_ID, title: "Panel académico", slice },
    ...(decision === undefined ? {} : { decision }),
  };
}

/** C1 finished, C2 waits for its tests to be approved, C3 in progress; C3's first try cancelled. */
const LOADED: readonly ListedChange[] = [
  sliceChange("20261018-c3", "C3", "implementing"),
  sliceChange("20261012-c1", "C1", "done"),
  sliceChange("20261010-c3-cancelado", "C3", "cancelled"),
  sliceChange("20261019-c2", "C2", "testing", "tests"),
];

const UNTOLD: SliceAnswer = { kind: "untold" };
const WAITING: SliceAnswer = { kind: "waiting" };

describe("the lines of an epic's card", () => {
  it("AC2: gives a line per slice of the Cortes section, in its order, with its title and its change", () => {
    const lanes = epicLanes(epicIn("implementing"), LOADED, UNTOLD);
    expect(lanes.map((lane) => [lane.key, lane.slice, lane.title, lane.change?.id])).toEqual([
      ["C1", "C1", "Asistencia por curso", "20261012-c1"],
      ["C2", "C2", "Avisos de calificaciones", "20261019-c2"],
      ["C3", "C3", "Acceso con Google", "20261018-c3"],
      ["C4", "C4", "Chat entre docentes", undefined],
      ["C5", "C5", "Recordatorios por correo", undefined],
    ]);
    expect(lanes.map((lane) => lane.state.kind)).toEqual([
      "done",
      "open",
      "open",
      "planned",
      "planned",
    ]);
    // The link opens the change on its own tab.
    expect(lanes[0]?.change).toEqual({ id: "20261012-c1", tab: "history" });
  });

  it("AC2: fills the stretches already passed and gives its phase's stretch; a finished slice, all four", () => {
    const cells = (phase: Phase) => laneCells({ kind: "open", phase });
    expect(LANE_STEPS.map((step) => step.es)).toEqual(["Spec", "Tests", "Impl.", "Acept."]);
    expect(LANE_STEPS.map((step) => step.en)).toEqual(["Spec", "Tests", "Impl.", "Accept."]);
    expect(cells("draft")).toEqual(["current", "empty", "empty", "empty"]);
    expect(cells("review")).toEqual(["current", "empty", "empty", "empty"]);
    expect(cells("testing")).toEqual(["past", "current", "empty", "empty"]);
    expect(cells("implementing")).toEqual(["past", "past", "current", "empty"]);
    expect(cells("adjusting")).toEqual(["past", "past", "current", "empty"]);
    expect(cells("acceptance")).toEqual(["past", "past", "past", "current"]);
    expect(cells("closing")).toEqual(["past", "past", "past", "current"]);
    expect(laneCells({ kind: "done" })).toEqual(["done", "done", "done", "done"]);
    expect(laneCells({ kind: "unknown" })).toEqual(["empty", "empty", "empty", "empty"]);
  });

  it("AC2: gives every line finished, without asking, in an epic in acceptance, closing or done", () => {
    for (const phase of ["acceptance", "closing", "done"] as const) {
      expect([phase, asksForSlices(phase)]).toEqual([phase, false]);
      const lanes = epicLanes(epicIn(phase), [LOADED[1] ?? fail()], WAITING);
      expect([phase, lanes.map((lane) => lane.state.kind)]).toEqual([
        phase,
        ["done", "done", "done", "done", "done"],
      ]);
      // Linked only when its change is loaded.
      expect([phase, lanes.map((lane) => lane.change?.id)]).toEqual([
        phase,
        ["20261012-c1", undefined, undefined, undefined, undefined],
      ]);
    }
    for (const phase of ["draft", "review", "implementing", "adjusting"] as const) {
      expect([phase, asksForSlices(phase)]).toEqual([phase, true]);
    }
    expect(asksForSlices("cancelled")).toBe(false);
  });

  it("AC2: adds at the end a change of the epic whose slice the Cortes section does not name", () => {
    const stray = sliceChange("20261020-c9", "C9", "implementing");
    const dropped = sliceChange("20261009-c8", "C8", "cancelled");
    const lanes = epicLanes(epicIn("implementing"), [...LOADED, stray, dropped], UNTOLD);
    expect(lanes.map((lane) => lane.key)).toEqual(["C1", "C2", "C3", "C4", "C5", "20261020-c9"]);
    expect(lanes.at(-1)).toEqual({
      key: "20261020-c9",
      slice: "C9",
      title: "Cambio C9",
      change: { id: "20261020-c9", tab: "progress" },
      state: { kind: "open", phase: "implementing" },
    });
  });

  it("AC3: says what a slice without a change waits for: the unfinished slices of its depends, in order", () => {
    for (const phase of ["implementing", "adjusting"] as const) {
      const lanes = epicLanes(epicIn(phase), LOADED, UNTOLD);
      expect([phase, lanes[3]?.state, lanes[4]?.state]).toEqual([
        phase,
        { kind: "planned", waitsFor: ["C2", "C3"], beforeApproval: false },
        { kind: "planned", waitsFor: [], beforeApproval: false },
      ]);
    }
  });

  it("AC3: says, while the epic is a draft or in review, that a slice starts once approved or after its depends", () => {
    for (const phase of ["draft", "review"] as const) {
      const lanes = epicLanes(epicIn(phase), [], UNTOLD);
      expect([phase, lanes.map((lane) => lane.state)]).toEqual([
        phase,
        [
          { kind: "planned", waitsFor: [], beforeApproval: true },
          { kind: "planned", waitsFor: ["C1"], beforeApproval: true },
          { kind: "planned", waitsFor: [], beforeApproval: true },
          { kind: "planned", waitsFor: ["C2", "C3"], beforeApproval: true },
          { kind: "planned", waitsFor: ["C1"], beforeApproval: true },
        ],
      ]);
    }
  });

  it("AC4: gives the decision a slice's change waits for, with the phase of its stretch", () => {
    const lanes = epicLanes(epicIn("implementing"), LOADED, UNTOLD);
    expect(lanes[1]?.state).toEqual({ kind: "open", phase: "testing", decision: "tests" });
    expect(lanes[1]?.change).toEqual({ id: "20261019-c2", tab: "progress" });
    expect(lanes[2]?.state).toEqual({ kind: "open", phase: "implementing" });
  });

  it("AC11: links a finished slice to the change the source gives, though it is not loaded, and uses only its answer", () => {
    const answer: SliceAnswer = {
      kind: "given",
      changes: [
        { slice: "C1", id: "20261001-c1-archivado", phase: "done" },
        { slice: "C2", id: "20261019-c2", phase: "testing" },
        { slice: "C3", id: "20261018-c3", phase: "implementing" },
      ],
    };
    const lanes = epicLanes(epicIn("implementing"), LOADED, answer);
    expect(lanes.map((lane) => [lane.slice, lane.change, lane.state])).toEqual([
      ["C1", { id: "20261001-c1-archivado" }, { kind: "done" }],
      [
        "C2",
        { id: "20261019-c2", tab: "progress" },
        { kind: "open", phase: "testing", decision: "tests" },
      ],
      ["C3", { id: "20261018-c3", tab: "progress" }, { kind: "open", phase: "implementing" }],
      ["C4", undefined, { kind: "planned", waitsFor: ["C2", "C3"], beforeApproval: false }],
      ["C5", undefined, { kind: "planned", waitsFor: [], beforeApproval: false }],
    ]);
  });

  it("AC11: leaves without state, while the source does not answer, a slice without a loaded change", () => {
    const lanes = epicLanes(epicIn("implementing"), LOADED, WAITING);
    expect(lanes.map((lane) => lane.state.kind)).toEqual([
      "done",
      "open",
      "open",
      "unknown",
      "unknown",
    ]);
    expect(lanes[3]?.change).toBeUndefined();
    // A cancelled epic asks nothing: without a loaded change, a slice has no state.
    const cancelled = epicLanes(epicIn("cancelled"), LOADED, UNTOLD);
    expect(cancelled.map((lane) => lane.state.kind)).toEqual([
      "done",
      "open",
      "open",
      "unknown",
      "unknown",
    ]);
  });
});

describe("the tally of an epic's slices", () => {
  it("AC6: counts, in implementation, the slices finished, waiting for the person, in progress, ready and waiting for another", () => {
    const epic = epicIn("implementing");
    expect(epicTally(epic, epicLanes(epic, LOADED, UNTOLD))).toEqual({
      total: 5,
      done: 1,
      waiting: 1,
      running: 1,
      ready: 1,
      blocked: 1,
      idle: [],
    });
    // A slice the source has not told about yet counts only in the total.
    expect(epicTally(epic, epicLanes(epic, [LOADED[1] ?? fail()], WAITING))).toEqual({
      total: 5,
      done: 1,
      waiting: 0,
      running: 0,
      ready: 0,
      blocked: 0,
      idle: [],
    });
  });

  it("AC6: gives no tally in any other phase: the head shows the phase", () => {
    for (const phase of [
      "draft",
      "review",
      "testing",
      "adjusting",
      "acceptance",
      "closing",
      "done",
      "cancelled",
    ] as const) {
      const epic = epicIn(phase);
      expect([phase, epicTally(epic, epicLanes(epic, LOADED, UNTOLD))]).toEqual([phase, undefined]);
    }
  });

  it("AC7: names the slices ready to start when none has an open change, in the spec's order", () => {
    const epic = epicIn("implementing");
    const onlyC1 = epicTally(epic, epicLanes(epic, [LOADED[1] ?? fail()], UNTOLD));
    expect(onlyC1).toEqual({
      total: 5,
      done: 1,
      waiting: 0,
      running: 0,
      ready: 3,
      blocked: 1,
      idle: ["C2", "C3", "C5"],
    });
    const none = epicTally(epic, epicLanes(epic, [], UNTOLD));
    expect(none?.idle).toEqual(["C1", "C3"]);
    expect([none?.ready, none?.blocked]).toEqual([2, 3]);
  });

  it("AC7: names none while a slice has an open change, or while the source has not answered", () => {
    const epic = epicIn("implementing");
    // C2 waits for the person: its change is open, though nobody works on it.
    const waiting = [LOADED[1] ?? fail(), LOADED[3] ?? fail()];
    expect(epicTally(epic, epicLanes(epic, waiting, UNTOLD))?.idle).toEqual([]);
    expect(epicTally(epic, epicLanes(epic, [], WAITING))?.idle).toEqual([]);
  });
});

function fail(): never {
  throw new Error("missing sample");
}
