// SPDX-License-Identifier: Apache-2.0

import type { MemoryEntry, StatusEntry } from "@baquia-dev/specty-core";
import { translator } from "@baquia-dev/specty-core/light";
import { changeLine, entryLine } from "./memory-lines";

const es = translator("es");
const en = translator("en");

const entry = (extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "P1",
  kind: "pending",
  status: "open",
  created: "2026-11-04T10:00:00.000Z",
  origin: { by: "claude-code" },
  text: "Texto",
  ...extra,
});

const change = (extra: Partial<StatusEntry> = {}): StatusEntry => ({
  id: "20261104-a",
  kind: "standard",
  phase: "implementing",
  title: "A",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  ...extra,
});

describe("the lines under each row of the memory page", () => {
  it("says who proposed to drop an entry and why", () => {
    const proposed = entry({
      status: "drop-proposed",
      drop: { reason: "Duplica P2.", by: "codex", at: "2026-11-04T11:00:00.000Z" },
    });
    expect(entryLine({ kind: "proposal", entry: proposed }, proposed, es)).toBe(
      "Propuesta para descartar por codex: «Duplica P2.»",
    );
    expect(entryLine({ kind: "proposal", entry: proposed }, proposed, en)).toBe(
      "Proposed to drop by codex: “Duplica P2.”",
    );
  });

  it("says how an entry closed, who took it, its quote, origin, author, day and what it waits for", () => {
    const closed = entry({
      status: "done",
      taken: { change: "20261104-b", at: "2026-11-04T12:00:00.000Z" },
      quote: "hazlo",
      origin: { by: "person", change: "20261103-c" },
      due: "2026-11-09",
      onClose: "20261104-d",
      paths: ["src/a.ts", "src/b.ts"],
    });
    expect(entryLine({ kind: "closed", entry: closed }, closed, es)).toBe(
      "hecha · tomada por 20261104-b · «hazlo» · 20261103-c · la persona · 2026-11-04 · desde 2026-11-09 · al cerrar 20261104-d · en src/a.ts, src/b.ts",
    );
    const dropped = entry({ status: "dropped" });
    expect(entryLine({ kind: "closed", entry: dropped }, dropped, en)).toBe(
      "dropped · claude-code · 2026-11-04",
    );
  });

  it("says who a change waits for and who holds it, and how long ago", () => {
    expect(changeLine(change({ holder: { tool: "claude-code", ago: 0 } }), es)).toBe(
      "20261104-a · standard · espera al agente · lo lleva claude-code, ahora mismo",
    );
    expect(changeLine(change({ waitingFor: "human", holder: { tool: "codex", ago: 5 } }), en)).toBe(
      "20261104-a · standard · waits for your decision · held by codex, 5 min ago",
    );
    expect(changeLine(change({ holder: { tool: "codex", ago: 125 } }), es)).toContain("hace 2 h");
    expect(
      changeLine(change({ waitingFor: "nobody", holder: { tool: "codex", ago: 3000 } }), en),
    ).toBe("20261104-a · standard · — · held by codex, 2 d ago");
    expect(changeLine(change({ orphan: true }), es)).toContain("ninguna sesión lo lleva");
    expect(changeLine(change(), en)).toContain("no session seen");
  });
});
