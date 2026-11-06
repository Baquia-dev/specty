// SPDX-License-Identifier: Apache-2.0
import type { ListedChange } from "../data/records";
import { epicLanes } from "./epic-lanes";
import { laneHolds } from "./lane-holds";

const EPIC_ID = "20261015-panel";

/** What every change of these tests shares: a change in progress. */
const BASE: ListedChange = {
  id: "",
  title: "",
  kind: "standard",
  phase: "implementing",
  phaseSince: "2026-11-06T11:00:00.000Z",
  createdAt: "2026-11-06T10:00:00.000Z",
  size: { level: "S", reasons: [] },
  tasks: { done: 0, total: 2 },
  tab: "progress",
};

/** A change of the slice `slice` of the epic `epic`, with `more`. */
function sliceChange(
  id: string,
  slice: string,
  more: Partial<ListedChange> = {},
  epic = EPIC_ID,
): ListedChange {
  return {
    ...BASE,
    id,
    title: `Cambio ${slice}`,
    epic: { id: epic, title: "Panel", slice },
    ...more,
  };
}

const C2 = sliceChange("20261019-c2", "C2", { holder: { tool: "claude-code", ago: 3 } });

describe("who holds the change of an epic's line, and what it warns of", () => {
  it("AC5: gives the agent that holds an open slice's change, by its name, however long ago it stepped", () => {
    expect(laneHolds(C2.id, [C2])).toEqual({ agent: "Claude Code", orphan: false });
    const late = sliceChange("20261019-c3", "C3", { holder: { tool: "codex", ago: 600 } });
    expect(laneHolds(late.id, [C2, late])).toEqual({ agent: "Codex", orphan: false });
  });

  it("AC5: names a tool the list of agents does not know by its id", () => {
    const other = sliceChange("20261019-c3", "C3", { holder: { tool: "aider", ago: 1 } });
    expect(laneHolds(other.id, [other])?.agent).toBe("aider");
  });

  it("AC5: gives no agent to an orphan, whoever stepped in its folder long ago", () => {
    const orphan = sliceChange("20261019-c3", "C3", {
      orphan: true,
      holder: { tool: "codex", ago: 300 },
    });
    expect(laneHolds(orphan.id, [orphan])).toEqual({ orphan: true });
  });

  it("AC5: gives the agent whose conversation left its folder, by its name", () => {
    const away = sliceChange("20261019-c3", "C3", {
      holder: { tool: "claude-code", ago: 90 },
      away: { tool: "codex", ago: 4 },
    });
    expect(laneHolds(away.id, [away])).toEqual({
      agent: "Claude Code",
      orphan: false,
      away: "Codex",
    });
  });

  it("AC5: names who it shares files with: a slice of the same epic by its id, another change by its title", () => {
    const c5 = sliceChange("20261020-c5", "C5");
    const elsewhere = sliceChange(
      "20261020-otra",
      "C5",
      { title: "Otra épica, su C5" },
      "20261001-otra",
    );
    const shares = sliceChange("20261019-c4", "C4", {
      holder: { tool: "codex", ago: 2 },
      shared: [
        {
          path: "src/audio/buffer.ts",
          changes: [
            { id: c5.id, title: c5.title },
            { id: "20261021-eco", title: "Corregir eco" },
          ],
        },
        {
          path: "src/room.ts",
          changes: [
            { id: c5.id, title: c5.title },
            { id: elsewhere.id, title: elsewhere.title },
          ],
        },
      ],
    });
    expect(laneHolds(shares.id, [shares, c5, elsewhere])?.shared).toEqual({
      paths: ["src/audio/buffer.ts", "src/room.ts"],
      with: ["C5", "«Corregir eco»", "«Otra épica, su C5»"],
    });
    expect(laneHolds(c5.id, [shares, c5])).toEqual({ orphan: false });
  });

  it("AC5: gives nothing for a line without a change, one not loaded, or one finished or cancelled", () => {
    const done = sliceChange("20261012-c1", "C1", { phase: "done", tab: "history" });
    const cancelled = sliceChange("20261010-c1", "C1", { phase: "cancelled", tab: "history" });
    expect(laneHolds(undefined, [C2])).toBeUndefined();
    expect(laneHolds("20261030-solo-de-la-fuente", [C2])).toBeUndefined();
    expect(laneHolds(done.id, [done])).toBeUndefined();
    expect(laneHolds(cancelled.id, [cancelled])).toBeUndefined();
  });

  it("AC5: puts on each line of an epic's card who holds its change", () => {
    const epic: ListedChange = {
      ...BASE,
      id: EPIC_ID,
      title: "Panel académico",
      kind: "epic",
      tab: "spec",
      slices: [
        { id: "C1", title: "Asistencia por curso" },
        { id: "C2", title: "Avisos de calificaciones" },
        { id: "C3", title: "Acceso con Google" },
        { id: "C4", title: "Chat entre docentes" },
      ],
    };
    const loaded = [
      sliceChange("20261012-c1", "C1", { phase: "done", tab: "history" }),
      C2,
      sliceChange("20261018-c3", "C3", { orphan: true }),
    ];
    const lanes = epicLanes(epic, loaded, { kind: "untold" });
    expect(lanes.map((lane) => [lane.slice, lane.holds])).toEqual([
      ["C1", undefined],
      ["C2", { agent: "Claude Code", orphan: false }],
      ["C3", { orphan: true }],
      ["C4", undefined],
    ]);
  });
});
