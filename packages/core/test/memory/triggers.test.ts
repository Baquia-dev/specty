// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  entriesForPaths,
  isDay,
  localDay,
  type MemoryEntry,
  parseEntry,
  serializeEntry,
  sessionEntries,
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

describe("the triggers of a reminder", () => {
  it("AC1: a reminder with a day stays out of the session until that day of the local date", () => {
    const entries = [
      entry("P1"),
      entry("P2", { due: "2026-11-10" }),
      entry("P3", { due: "2026-11-03" }),
      entry("P4", { kind: "pending" }),
    ];
    expect(ids(sessionEntries(entries, "2026-11-03"))).toEqual(["P1", "P3", "P4"]);
    expect(ids(sessionEntries(entries, "2026-11-10"))).toEqual(["P1", "P2", "P3", "P4"]);
    expect(ids(sessionEntries(entries, "2026-12-01"))).toEqual(["P1", "P2", "P3", "P4"]);
    expect(localDay(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03");
    expect(localDay(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });

  it("AC1: the day is kept in the frontmatter, only for a reminder", () => {
    const reminder = entry("P2", { due: "2026-11-10" });
    expect(parseEntry(serializeEntry(reminder))).toEqual(reminder);
    expect(parseEntry(serializeEntry(entry("P5", { kind: "pending", due: "2026-11-10" })))).toBe(
      undefined,
    );
    expect(parseEntry(serializeEntry(entry("P6", { due: "10/11/2026" })))).toBe(undefined);
  });

  it("AC2: a reminder with paths leaves the session and matches the files, as a lesson does", () => {
    const api = entry("P7", { paths: ["src/api/**"] });
    const pending = entry("P8", { kind: "pending", paths: ["src/api/**"] });
    expect(ids(sessionEntries([api, pending], "2026-11-03"))).toEqual(["P8"]);
    expect(entriesForPaths([api], ["src/api/client.ts"])).toEqual([api]);
    expect(entriesForPaths([api], ["src/**"])).toEqual([api]);
    expect(entriesForPaths([api], ["src/ui/app.ts"])).toEqual([]);
    expect(entriesForPaths([{ ...api, status: "done" }], ["src/api/client.ts"])).toEqual([]);
    expect(entriesForPaths([pending], ["src/api/client.ts"])).toEqual([]);
  });

  it("AC3: a day is a date of the calendar written as YYYY-MM-DD", () => {
    expect(isDay("2026-11-10")).toBe(true);
    expect(isDay("2028-02-29")).toBe(true);
    for (const text of ["2026-02-30", "2026-13-01", "10/11/2026", "2026-1-5", "mañana", ""])
      expect(isDay(text)).toBe(false);
  });
});
