// SPDX-License-Identifier: Apache-2.0
// `specty stats` (ARCHITECTURE §6): the panel's summary in the terminal, its empty state and its
// refusals, in Spanish and in English.
import { describe, expect, it } from "vitest";
import {
  type CardContext,
  renderText,
  type StatsView,
  statsCard,
  statsRefusalCard,
} from "../../src";

const ES: CardContext = { lang: "es", command: "specty", quickMaxFiles: 3, implicitTests: true };
const EN: CardContext = { ...ES, lang: "en" };

/** A row of «Personas y agentes», as `StatsView` brings it. */
type StatsPeopleRow = NonNullable<StatsView["people"]>[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A row of «Personas y agentes»: `who`'s figures, those not given as an idle one's. */
const person = (
  kind: StatsPeopleRow["who"]["kind"],
  name: string,
  figures: Partial<Omit<StatsPeopleRow, "who">> = {},
): StatsPeopleRow => ({
  who: { kind, name },
  changes: 1,
  tasks: 0,
  cycle: null,
  verifications: null,
  sessions: 0,
  cost: null,
  ...figures,
});

/** The last 30 days: each figure with a different comparison, and a row per who. */
const VIEW: StatsView = {
  query: { period: "30d" },
  range: { from: "2026-10-09", to: "2026-11-07" },
  previous: { from: "2026-09-09", to: "2026-10-08" },
  changes: 3,
  options: [],
  summary: {
    closed: { value: 4, previous: 2, change: 1 },
    tasks: { value: 9, previous: 10, change: -0.1 },
    cycle: { value: 27 * HOUR, previous: null, change: null },
    verifications: { value: 0.925, previous: 0.925, change: 0, count: 40 },
    cost: { value: 12.3, previous: null, change: null, measured: 2, of: 4 },
    pending: { value: 5, previous: 4, change: 0.25 },
  },
  people: [
    person("person", "Bea", {
      changes: 2,
      tasks: 9,
      cycle: 2 * HOUR + 30 * MINUTE,
      verifications: 0.9,
      sessions: 3,
      cost: 12.3,
    }),
    person("person", ""),
    person("agent", "claude-code", { changes: 3, tasks: 9, sessions: 3 }),
    person("model", "m-1", { changes: 3, tasks: 9, cycle: 45 * MINUTE, verifications: 1 }),
  ],
};

/** The lines of a card's block, by its title. */
const block = (text: string, title: string): string[] => {
  const lines = text.split("\n");
  const start = lines.indexOf(`${title}:`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && !line.startsWith("  "));
  return lines.slice(start + 1, end < 0 ? undefined : end).map((line) => line.trim());
};

/** A table's row, its cells apart however wide their columns are. */
const cells = (line: string | undefined): string[] => (line ?? "").split(/\s{2,}/);

describe("the summary of `specty stats`", () => {
  it("AC1: the last 30 days with their dates, the six figures against the 30 days before and a row per person, agent and model", () => {
    const card = statsCard(VIEW, ES);
    expect(card.status).toBe("ok");
    const text = renderText(card, "es");
    expect(text.split("\n")[0]).toBe("SPECTY · stats · últimos 30 días · 2026-10-09 – 2026-11-07");
    expect(block(text, "INDICADORES, FRENTE A LOS 30 DÍAS ANTERIORES")).toEqual([
      "Cambios cerrados: 4 · ▲ 100 %",
      "Tareas completadas: 9 · ▼ 10 %",
      "Ciclo (mediana): 1 d 3 h · sin datos antes",
      "Verificaciones que pasan: 92,5 % de 40 verificaciones de tarea · sin cambios",
      "Coste medido: 12,30 USD en 2 de 4 cambios cerrados · sin datos antes",
      "Pendientes abiertos: 5 · ▲ 25 %",
    ]);
    const people = block(text, "POR PERSONA");
    expect(cells(people[0])).toEqual([
      "Nombre",
      "Cambios",
      "Tareas",
      "Ciclo",
      "Pasan",
      "Sesiones",
      "Coste",
    ]);
    expect(cells(people[1])).toEqual(["Bea", "2", "9", "2 h 30 min", "90 %", "3", "12,30 USD"]);
    expect(cells(people[2])).toEqual(["(sin dato)", "1", "0", "—", "—", "0", "—"]);
    // The columns line up: every row as long as the header.
    expect(new Set(people.map((line) => line.length)).size).toBe(1);
    expect(cells(block(text, "POR AGENTE")[1])).toEqual([
      "claude-code",
      "3",
      "9",
      "—",
      "—",
      "3",
      "—",
    ]);
    expect(cells(block(text, "POR MODELO")[1])).toEqual([
      "m-1",
      "3",
      "9",
      "45 min",
      "100 %",
      "0",
      "—",
    ]);
    expect(card.next).toContain("`specty ui`");
  });

  it("AC2: the header says the cut, and «Todo» compares with nothing", () => {
    const week: StatsView = {
      ...VIEW,
      query: { period: "7d", who: { kind: "person", name: "Bea" }, kind: "quick" },
      range: { from: "2026-11-01", to: "2026-11-07" },
      previous: { from: "2026-10-25", to: "2026-10-31" },
    };
    expect(statsCard(week, ES).header).toBe(
      "SPECTY · stats · últimos 7 días · 2026-11-01 – 2026-11-07 · persona Bea · carril quick",
    );
    const unknown: StatsView = {
      ...VIEW,
      query: { period: "90d", who: { kind: "model", name: "" } },
    };
    expect(statsCard(unknown, ES).header).toContain("· últimos 90 días ·");
    expect(statsCard(unknown, ES).header).toContain("· modelo (sin dato)");
    expect(
      statsCard({ ...VIEW, query: { period: "30d", who: { kind: "agent", name: "codex" } } }, ES)
        .header,
    ).toContain("· agente codex");

    const { previous: _, ...rest } = VIEW;
    const all: StatsView = {
      ...rest,
      query: { period: "all" },
      range: { from: "2026-01-02", to: "2026-11-07" },
      summary: {
        closed: { value: 4 },
        tasks: { value: 9 },
        cycle: { value: null },
        verifications: { value: 0.925, count: 40 },
        cost: { value: 12.3, measured: 2, of: 4 },
        pending: { value: 5 },
      },
    };
    const text = renderText(statsCard(all, ES), "es");
    expect(text.split("\n")[0]).toBe("SPECTY · stats · todo · 2026-01-02 – 2026-11-07");
    expect(block(text, "INDICADORES")).toEqual([
      "Cambios cerrados: 4",
      "Tareas completadas: 9",
      "Ciclo (mediana): —",
      "Verificaciones que pasan: 92,5 % de 40 verificaciones de tarea",
      "Coste medido: 12,30 USD en 2 de 4 cambios cerrados",
      "Pendientes abiertos: 5",
    ]);
  });

  it("AC4: refuses a period, a who or a lane it does not understand, with the valid ones", () => {
    const period = statsRefusalCard({ reason: "period", value: "1y" }, ES);
    expect(period.status).toBe("invalid");
    expect(period.blocks[0]?.lines).toEqual(["No conozco el periodo 1y."]);
    for (const valid of ["--period 7d", "--period 30d", "--period 90d", "--period all"]) {
      expect(period.next).toContain(valid);
    }
    const who = statsRefusalCard({ reason: "who", value: "nadie" }, ES);
    expect(who.status).toBe("invalid");
    expect(who.blocks[0]?.lines[0]).toContain("nadie");
    for (const valid of ["person:<nombre>", "agent:<herramienta>", "model:<modelo>"]) {
      expect(who.next).toContain(valid);
    }
    const kind = statsRefusalCard({ reason: "kind", value: "bug" }, ES);
    expect(kind.status).toBe("invalid");
    expect(kind.blocks[0]?.lines).toEqual(["No conozco el carril bug."]);
    for (const valid of ["quick", "standard", "spike", "retro", "epic"]) {
      expect(kind.next).toContain(valid);
    }
  });

  it("AC5: with no change in the cut it says so, without figures nor tables", () => {
    const empty: StatsView = { ...VIEW, changes: 0, people: [] };
    const card = statsCard(empty, ES);
    expect(card.status).toBe("ok");
    const text = renderText(card, "es");
    expect(text).toContain("No hay ningún cambio en este corte en el periodo.");
    expect(text).not.toContain("INDICADORES");
    expect(text).not.toContain("POR PERSONA");
    expect(card.next).toContain("--period all");
  });

  it("AC6: the summary, the empty state and the refusals in English", () => {
    const text = renderText(statsCard(VIEW, EN), "en");
    expect(text.split("\n")[0]).toBe("SPECTY · stats · last 30 days · 2026-10-09 – 2026-11-07");
    expect(block(text, "FIGURES, VS. THE PREVIOUS 30 DAYS")).toEqual([
      "Changes closed: 4 · ▲ 100%",
      "Tasks completed: 9 · ▼ 10%",
      "Cycle (median): 1 d 3 h · no data before",
      "Verifications passing: 92.5% of 40 task verifications · no change",
      "Measured cost: 12.30 USD in 2 of 4 closed changes · no data before",
      "Open pending items: 5 · ▲ 25%",
    ]);
    const people = block(text, "BY PERSON");
    expect(cells(people[0])).toEqual([
      "Name",
      "Changes",
      "Tasks",
      "Cycle",
      "Passing",
      "Sessions",
      "Cost",
    ]);
    expect(cells(people[1])).toEqual(["Bea", "2", "9", "2 h 30 min", "90%", "3", "12.30 USD"]);
    expect(cells(people[2])).toEqual(["(no data)", "1", "0", "—", "—", "0", "—"]);
    expect(block(text, "BY AGENT")).toHaveLength(2);
    expect(block(text, "BY MODEL")).toHaveLength(2);
    expect(
      statsCard(
        { ...VIEW, query: { period: "7d", who: { kind: "person", name: "" }, kind: "epic" } },
        EN,
      ).header,
    ).toBe("SPECTY · stats · last 7 days · 2026-10-09 – 2026-11-07 · person (no data) · lane epic");

    const empty = renderText(statsCard({ ...VIEW, changes: 0 }, EN), "en");
    expect(empty).toContain("There is no change in this cut in the period.");

    expect(statsRefusalCard({ reason: "period", value: "1y" }, EN).blocks[0]?.lines).toEqual([
      "I do not know the period 1y.",
    ]);
    expect(statsRefusalCard({ reason: "who", value: "nadie" }, EN).next).toContain("person:<name>");
    expect(statsRefusalCard({ reason: "kind", value: "bug" }, EN).blocks[0]?.lines).toEqual([
      "I do not know the lane bug.",
    ]);
  });
});

/** Where the time of the changes went: the median of each phase, and on how many changes. */
const FLOW: NonNullable<StatsView["flow"]> = {
  phases: [
    { phase: "spec", median: 25 * MINUTE, changes: 40 },
    { phase: "review", median: 2 * HOUR, changes: 40 },
    { phase: "implementation", median: 90 * MINUTE, changes: 1 },
    { phase: "closing", median: null, changes: 0 },
  ],
  approvals: { delegated: 3, tty: 1, ui: 0 },
  wait: { median: HOUR, approvals: 1 },
  revisions: 1.5,
  sessions: { mean: 1, changes: 3 },
};

/** What the changes cost: the costliest first, one still open. */
const COST: NonNullable<StatsView["cost"]> = {
  unit: "day",
  buckets: [],
  tokens: { input: 10, output: 20, cacheWrite: 30, cacheRead: 40, calls: 5, changes: 2 },
  lanes: [
    { kind: "standard", cost: 12.3, changes: 1 },
    { kind: "quick", cost: 0.5, changes: 1 },
  ],
  top: [
    {
      id: "20261105-guard-y-alcance",
      kind: "standard",
      cost: 12.3,
      tasks: 4,
      cycle: 27 * HOUR,
      sessions: 2,
    },
    { id: "20261106-abierto", kind: "quick", cost: 0.5, tasks: 0, cycle: null, sessions: 0 },
  ],
};

/** The sections `specty stats` adds, on the summary of the last 30 days. */
const SPENT: StatsView = { ...VIEW, flow: FLOW, cost: COST };

describe("the phases and the costliest changes of `specty stats`", () => {
  it("AC7: after the tables, the median time of each phase and the costliest changes", () => {
    const text = renderText(statsCard(SPENT, ES), "es");
    expect(block(text, "TIEMPO POR FASE (MEDIANA)")).toEqual([
      "Redactar la spec: 25 min · en 40 cambios",
      "Revisión hasta aprobar: 2 h · en 40 cambios",
      "Implementación: 1 h 30 min · en 1 cambio",
      "Aceptación y cierre: —",
    ]);
    const top = block(text, "LOS CAMBIOS MÁS CAROS");
    expect(cells(top[0])).toEqual(["Cambio", "Carril", "Tareas", "Ciclo", "Sesiones", "Coste"]);
    expect(cells(top[1])).toEqual([
      "20261105-guard-y-alcance",
      "standard",
      "4",
      "1 d 3 h",
      "2",
      "12,30 USD",
    ]);
    expect(cells(top[2])).toEqual(["20261106-abierto", "quick", "0", "—", "0", "0,50 USD"]);
    // The columns line up: every row as long as the header.
    expect(new Set(top.map((line) => line.length)).size).toBe(1);
    // In the panel's order: the tables, the phases, then the costliest.
    expect(text.indexOf("POR MODELO:")).toBeLessThan(text.indexOf("TIEMPO POR FASE (MEDIANA):"));
    expect(text.indexOf("TIEMPO POR FASE (MEDIANA):")).toBeLessThan(
      text.indexOf("LOS CAMBIOS MÁS CAROS:"),
    );
  });

  it("AC7: without anything to tell, neither block", () => {
    const quiet: StatsView = {
      ...SPENT,
      flow: {
        ...FLOW,
        phases: FLOW.phases.map((phase) => ({ ...phase, median: null, changes: 0 })),
      },
      cost: { ...COST, lanes: [], top: [] },
    };
    for (const view of [VIEW, quiet]) {
      const text = renderText(statsCard(view, ES), "es");
      expect(text).toContain("POR PERSONA:");
      expect(text).not.toContain("TIEMPO POR FASE");
      expect(text).not.toContain("LOS CAMBIOS MÁS CAROS");
    }
    const empty = renderText(statsCard({ ...SPENT, changes: 0 }, ES), "es");
    expect(empty).not.toContain("TIEMPO POR FASE");
    expect(empty).not.toContain("LOS CAMBIOS MÁS CAROS");
  });

  it("AC8: the phases and the costliest changes in English", () => {
    const text = renderText(statsCard(SPENT, EN), "en");
    expect(block(text, "TIME PER PHASE (MEDIAN)")).toEqual([
      "Write the spec: 25 min · in 40 changes",
      "Review until approved: 2 h · in 40 changes",
      "Implementation: 1 h 30 min · in 1 change",
      "Acceptance and closing: —",
    ]);
    const top = block(text, "THE COSTLIEST CHANGES");
    expect(cells(top[0])).toEqual(["Change", "Lane", "Tasks", "Cycle", "Sessions", "Cost"]);
    expect(cells(top[1])).toEqual([
      "20261105-guard-y-alcance",
      "standard",
      "4",
      "1 d 3 h",
      "2",
      "12.30 USD",
    ]);
  });
});
