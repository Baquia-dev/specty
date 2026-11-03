// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  claimable,
  freeWork,
  type MemoryEntry,
  memoryCommitSubject,
  memoryListCard,
  parseEntry,
  renderText,
  resolvesRefusalCard,
  type StatusEntry,
  serializeEntry,
  takenEntry,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

const CHANGE = "20261103-saludo";
const AT = "2026-11-03T12:00:00.000Z";
const CLOSED = { at: AT, by: "person" };

let day = 0;

/** An open pending item, a day after the one before unless `created` says otherwise. */
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => {
  day += 1;
  return {
    id,
    kind: "pending",
    status: "open",
    created: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
    origin: { by: "claude-code" },
    text: `Texto de ${id}`,
    ...extra,
  };
};

const taken = (id: string, change: string) =>
  entry(id, { status: "taken", taken: { change, at: AT } });

const HOLDER: StatusEntry = {
  id: CHANGE,
  kind: "standard",
  phase: "implementing",
  title: "Saludo",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
  folder: "../repo.worktrees/20261103-saludo",
  holder: { tool: "claude-code", ago: 3 },
};

/** The same change, with neither its folder nor who holds it known. */
const BARE: StatusEntry = {
  id: CHANGE,
  kind: "standard",
  phase: "implementing",
  title: "Saludo",
  waitingFor: "agent",
  current: false,
  pendingScope: [],
};

describe("what --resolves can take", () => {
  it("AC1: takes the open pending items and improvements it names, whatever their case", () => {
    const memory = [entry("P1"), entry("P2", { kind: "improvement" }), entry("P3")];
    expect(claimable(["p1", "P02"], memory, new Set())).toEqual({
      entries: [memory[0], memory[1]],
    });
  });

  it("AC1: marks the entry taken by the change, and keeps it through its file", () => {
    const took = takenEntry(entry("P1"), CHANGE, AT);
    expect(took).toMatchObject({ id: "P1", status: "taken", taken: { change: CHANGE, at: AT } });
    expect(parseEntry(serializeEntry(took))).toEqual(took);
  });

  it("AC1: lists a taken entry with the change that took it", () => {
    const memory = [taken("P1", CHANGE), entry("P2", { status: "taken" })];
    const text = (ctx: CardContext) =>
      renderText(memoryListCard(memory, { all: false }, ctx), ctx.lang);
    expect(text(ES)).toContain(`P1 · pendiente · tomada por ${CHANGE} · Texto de P1`);
    expect(text(ES)).toContain("P2 · pendiente · tomada · Texto de P2");
    expect(text(EN)).toContain(`P1 · pending · taken by ${CHANGE} · Texto de P1`);
  });

  it("AC1: commits the take with a subject of its own", () => {
    expect(memoryCommitSubject("take", "P4", "es")).toBe("memoria: P4 tomada");
    expect(memoryCommitSubject("take", "P4", "en")).toBe("memory: P4 taken");
  });

  it("AC1: leaves taken entries out of the free ones, which go by date", () => {
    const memory = [
      entry("P3", { created: "2026-11-02T10:00:00.000Z" }),
      taken("P1", CHANGE),
      entry("P2", { kind: "improvement", created: "2026-11-01T10:00:00.000Z" }),
      entry("P4", { kind: "reminder" }),
      entry("D1", { kind: "decision", quote: "sí" }),
      entry("P5", { status: "done", closed: CLOSED }),
      entry("P6", { status: "drop-proposed" }),
    ];
    expect(freeWork(memory).map((free) => free.id)).toEqual(["P2", "P3"]);
  });

  it("AC2: refuses an entry an open change took, naming that change", () => {
    const memory = [taken("P1", CHANGE), entry("P2")];
    expect(claimable(["P2", "P1"], memory, new Set([CHANGE]))).toEqual({
      problem: { reason: "taken", entry: memory[0], change: CHANGE },
    });
  });

  it("AC2: takes again an entry whose change is no longer open", () => {
    const memory = [taken("P1", "20261020-viejo")];
    expect(claimable(["P1"], memory, new Set([CHANGE]))).toEqual({ entries: memory });
  });

  it("AC3: refuses an id the memory does not have", () => {
    const memory = [entry("P1")];
    expect(claimable(["P9"], memory, new Set())).toEqual({
      problem: { reason: "unknown", id: "P9" },
    });
    expect(claimable(["algo"], memory, new Set())).toEqual({
      problem: { reason: "unknown", id: "algo" },
    });
  });

  it("AC3: refuses an entry done, dropped or proposed to drop, before looking at its kind", () => {
    for (const status of ["done", "dropped", "drop-proposed"] as const) {
      const closed = entry("P1", { kind: "reminder", status, closed: CLOSED });
      expect(claimable(["P1"], [closed], new Set())).toEqual({
        problem: { reason: "unavailable", entry: closed },
      });
    }
  });

  it("AC3: refuses an open reminder or decision", () => {
    const reminder = entry("P1", { kind: "reminder" });
    const decision = entry("D1", { kind: "decision", quote: "sí" });
    expect(claimable(["P1"], [reminder, decision], new Set())).toEqual({
      problem: { reason: "not-work", entry: reminder },
    });
    expect(claimable(["D1"], [reminder, decision], new Set())).toEqual({
      problem: { reason: "not-work", entry: decision },
    });
  });
});

describe("the card of a --resolves that takes nothing", () => {
  const text = (card: ReturnType<typeof resolvesRefusalCard>, ctx: CardContext = ES) =>
    renderText(card, ctx.lang);

  it("AC2: names the change that took it, its phase, its folder, who holds it and the next free one", () => {
    const refusal = {
      reason: "taken",
      entry: taken("P1", CHANGE),
      by: HOLDER,
      free: entry("P2", { text: "Dos\ncon más texto" }),
    } as const;
    const es = text(resolvesRefusalCard(refusal, ES));
    expect(es).toContain(
      `P1 ya la tomó el cambio ${CHANGE} (implementing, en ../repo.worktrees/20261103-saludo, lo lleva claude-code, hace 3 min).`,
    );
    expect(es).toContain(
      `SIGUIENTE: pregúntale al usuario si sigue con ${CHANGE}; la siguiente libre es P2, «Dos»: \`specty new "<título>" --resolves P2\`.`,
    );
    const en = text(resolvesRefusalCard(refusal, EN), EN);
    expect(en).toContain(
      `P1 was already taken by change ${CHANGE} (implementing, in ../repo.worktrees/20261103-saludo, held by claude-code, 3 min ago).`,
    );
    expect(en).toContain(
      `NEXT: ask the user whether to go on with ${CHANGE}; the next free one is P2, “Dos”: \`specty new "<title>" --resolves P2\`.`,
    );
  });

  it("AC2: says so when no entry is free, and leaves out what it does not know", () => {
    const refusal = {
      reason: "taken",
      entry: taken("P1", CHANGE),
      by: BARE,
    } as const;
    const es = text(resolvesRefusalCard(refusal, ES));
    expect(es).toContain(`P1 ya la tomó el cambio ${CHANGE} (implementing).`);
    expect(es).toContain(
      `SIGUIENTE: pregúntale al usuario si sigue con ${CHANGE}: no queda ninguna entrada libre.`,
    );
    expect(text(resolvesRefusalCard(refusal, EN), EN)).toContain(
      `NEXT: ask the user whether to go on with ${CHANGE}: no entry is free.`,
    );
  });

  it("AC3: says why it cannot take an unknown id, a reminder, a decision or a closed entry", () => {
    const cases = [
      [
        { reason: "unknown", id: "P9" },
        "La memoria no tiene la entrada P9.",
        "Specty's memory has no entry P9.",
      ],
      [
        { reason: "not-work", entry: entry("P1", { kind: "reminder" }) },
        "P1 es un recordatorio: `--resolves` solo toma pendientes y mejoras.",
        "P1 is a reminder: `--resolves` only takes pending items and improvements.",
      ],
      [
        { reason: "not-work", entry: entry("D1", { kind: "decision", quote: "sí" }) },
        "D1 es una decisión: `--resolves` solo toma pendientes y mejoras.",
        "D1 is a decision: `--resolves` only takes pending items and improvements.",
      ],
      [
        { reason: "unavailable", entry: entry("P2", { status: "done", closed: CLOSED }) },
        "P2 ya está hecha: no se puede tomar.",
        "P2 is already done: it cannot be taken.",
      ],
      [
        { reason: "unavailable", entry: entry("P3", { status: "dropped", closed: CLOSED }) },
        "P3 ya está descartada: no se puede tomar.",
        "P3 is already dropped: it cannot be taken.",
      ],
      [
        { reason: "unavailable", entry: entry("P4", { status: "drop-proposed" }) },
        "P4 ya está propuesta para descartar: no se puede tomar.",
        "P4 is already proposed to drop: it cannot be taken.",
      ],
    ] as const;
    for (const [refusal, es, en] of cases) {
      const card = resolvesRefusalCard(refusal, ES);
      expect(card.status).not.toBe("ok");
      expect(text(card)).toContain(es);
      expect(text(resolvesRefusalCard(refusal, EN), EN)).toContain(en);
    }
  });

  it("AC3: points to the memory for an unknown id, and to a change without it otherwise", () => {
    expect(text(resolvesRefusalCard({ reason: "unknown", id: "P9" }, ES))).toContain(
      "SIGUIENTE: mira las entradas con `specty memory` y vuelve a ejecutar `specty new`.",
    );
    const reminder = { reason: "not-work", entry: entry("P1", { kind: "reminder" }) } as const;
    expect(text(resolvesRefusalCard(reminder, ES))).toContain(
      "SIGUIENTE: crea el cambio sin `--resolves P1`.",
    );
    expect(text(resolvesRefusalCard(reminder, EN), EN)).toContain(
      "NEXT: create the change without `--resolves P1`.",
    );
  });
});
