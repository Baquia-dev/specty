// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  firedEntry,
  type MemoryEntry,
  parseEntry,
  serializeEntry,
  sessionEntries,
  waitingFor,
} from "../../src";

/** A reminder of the memory, unless `extra` says otherwise. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  kind: "reminder",
  status: "open",
  created: "2026-11-01T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: `Texto de ${id}`,
  ...extra,
});

const ids = (entries: readonly MemoryEntry[]) => entries.map((one) => one.id);

const SALUDO = "20261103-saludo";

describe("a reminder that waits for a change to close", () => {
  it("AC1: keeps its change in the frontmatter, only as a reminder, and stays out of the session", () => {
    const reminder = entry("P2", { onClose: SALUDO });
    expect(parseEntry(serializeEntry(reminder))).toEqual(reminder);
    expect(serializeEntry(reminder)).toContain(`onClose: ${SALUDO}\n`);
    expect(parseEntry(serializeEntry(entry("P3", { kind: "pending", onClose: SALUDO })))).toBe(
      undefined,
    );
    const entries = [entry("P1"), reminder, entry("P4", { kind: "pending" })];
    expect(ids(sessionEntries(entries, "2026-11-03"))).toEqual(["P1", "P4"]);
    expect(ids(sessionEntries(entries, "2027-01-01"))).toEqual(["P1", "P4"]);
  });

  it("AC2: fires when its change is archived: only the open reminders of that change", () => {
    const drop = { reason: "Ya no aplica.", by: "claude-code", at: "2026-11-02T10:00:00.000Z" };
    const entries = [
      entry("P5", { onClose: SALUDO, status: "drop-proposed", drop }),
      entry("P1", { onClose: SALUDO }),
      entry("P2", { onClose: "20261103-otro" }),
      entry("P3", {
        onClose: SALUDO,
        status: "done",
        closed: { at: "2026-11-02T11:00:00.000Z", by: "person" },
      }),
      entry("P4"),
    ];
    expect(ids(waitingFor(entries, SALUDO))).toEqual(["P1", "P5"]);
    expect(waitingFor(entries, "20261103-nada")).toEqual([]);
  });

  it("AC2: a fired reminder loses its trigger and shows in every session", () => {
    const fired = firedEntry(entry("P1", { onClose: SALUDO }));
    expect(fired).toEqual(entry("P1"));
    expect(Object.keys(fired)).not.toContain("onClose");
    expect(ids(sessionEntries([fired], "2026-11-03"))).toEqual(["P1"]);
    expect(parseEntry(serializeEntry(fired))).toEqual(fired);
  });
});
