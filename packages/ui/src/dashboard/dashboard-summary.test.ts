// SPDX-License-Identifier: Apache-2.0
// The first row of the «Panel» (docs/ui.md): each of the six figures with its minigraph, its value
// in each day or week of the period, and «Ver tabla» with all of them, in Spanish and in English.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import type { StatsView } from "@baquia-dev/specty-core";
import { formatDuration } from "../data/progress";
import { DashboardSummary } from "./dashboard-summary";

const HOUR = 3_600_000;

type Trend = NonNullable<StatsView["trend"]>;
type Bucket = Trend["buckets"][number];

/** A day of the period, with what `more` changes of a quiet one. */
const day = (date: number, pending: number, more: Partial<Bucket> = {}): Bucket => {
  const from = `2026-11-0${date}`;
  return {
    from,
    to: from,
    closed: 0,
    tasks: 0,
    cycle: null,
    verifications: null,
    cost: null,
    pending,
    ...more,
  };
};

/** 1 to 7 November: a change closed on the 4th and two on the 6th. */
const DAYS: Trend = {
  unit: "day",
  buckets: [
    day(1, 1),
    day(2, 2),
    day(3, 2),
    day(4, 2, { closed: 1, tasks: 1, cycle: HOUR, verifications: 0.5, cost: 2.5 }),
    day(5, 3),
    day(6, 2, { closed: 2, tasks: 2, cycle: 4 * HOUR, verifications: 1 }),
    day(7, 2),
  ],
};

/** The weeks of 26 October and of 2 November, the last one cut to today. */
const WEEKS: Trend = {
  unit: "week",
  buckets: [
    { ...day(1, 1), from: "2026-10-26", to: "2026-11-01" },
    { ...day(7, 2, { closed: 3, tasks: 3 }), from: "2026-11-02", to: "2026-11-07" },
  ],
};

function viewOf(trend: Trend | undefined): StatsView {
  return {
    query: { period: trend?.unit === "week" ? "90d" : "7d" },
    range: { from: "2026-11-01", to: "2026-11-07" },
    previous: { from: "2026-10-25", to: "2026-10-31" },
    changes: 5,
    options: [],
    summary: {
      closed: { value: 3, previous: 2, change: 0.5 },
      tasks: { value: 3, previous: 3, change: 0 },
      cycle: { value: 3 * HOUR, previous: null, change: null },
      verifications: { value: 2 / 3, previous: 1, change: -1 / 3, count: 3 },
      cost: { value: 2.5, previous: 1, change: 1.5, measured: 1, of: 3 },
      pending: { value: 2, previous: 1, change: 1 },
    },
    ...(trend === undefined ? {} : { trend }),
  };
}

@Component({
  imports: [DashboardSummary],
  template: `<sp-dashboard-summary [view]="view()" />`,
})
class Host {
  readonly view = signal(viewOf(DAYS));
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();
/** What `Intl` writes, with plain spaces. */
const plain = (written: string) => written.replace(/\s/g, " ");
const shortDay = (month: number, date: number, lang: string) =>
  plain(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
      new Date(2026, month, date),
    ),
  );
const percent = (value: number, lang: string) =>
  plain(new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 }).format(value));
const usd = (value: number, lang: string) =>
  plain(new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value));

const IDS = ["closed", "tasks", "cycle", "verifications", "cost", "pending"];

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const kpi = (id: string) => element.querySelector<HTMLElement>(`[data-kpi="${id}"]`);
  const marks = (id: string) => [
    ...(kpi(id)?.querySelectorAll<HTMLButtonElement>("[data-mark]") ?? []),
  ];
  const group = (id: string) => kpi(id)?.querySelector("[data-trend] [role=group]");
  const toggle = () => element.querySelector<HTMLButtonElement>("[data-kpis-toggle]");
  const table = () => element.querySelector("[data-kpis-table]");
  const head = () => [...(table()?.querySelectorAll("thead th") ?? [])].map(text);
  const rows = () =>
    [...(table()?.querySelectorAll("tbody tr") ?? [])].map((row) => [...row.children].map(text));
  const settle = () => fixture.whenStable();
  return {
    host: fixture.componentInstance,
    element,
    kpi,
    marks,
    group,
    toggle,
    table,
    head,
    rows,
    settle,
  };
}

describe("the figures of the panel with their minigraphs", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: each of the six figures has its minigraph under its change, with its value in each day and the last one marked", async () => {
    const { kpi, marks, group } = await render();
    for (const id of IDS) {
      const tile = kpi(id);
      expect(tile?.querySelector("[data-trend]")).not.toBeNull();
      expect(marks(id)).toHaveLength(7);
      // The minigraph goes last, under the change and the note.
      const parts = [...(tile?.querySelectorAll("[data-delta], [data-note], [data-trend]") ?? [])];
      expect(parts[0]?.hasAttribute("data-delta")).toBe(true);
      expect(parts.at(-1)?.hasAttribute("data-trend")).toBe(true);
      expect(tile?.querySelectorAll("[data-point]").length).toBeGreaterThan(0);
    }
    expect(group("closed")?.getAttribute("aria-label")).toBe("Cambios cerrados por día");
    expect(group("pending")?.getAttribute("aria-label")).toBe("Pendientes abiertos por día");

    // Each day's value as its figure reads.
    const nov = (date: number) => shortDay(10, date, "es");
    expect(marks("closed")[5]?.getAttribute("aria-label")).toBe(`${nov(6)}: Cambios cerrados 2`);
    expect(marks("cycle")[3]?.getAttribute("aria-label")).toBe(
      plain(`${nov(4)}: Ciclo (mediana) ${formatDuration(HOUR, "es")}`),
    );
    expect(marks("cycle")[0]?.getAttribute("aria-label")).toBe(
      `${nov(1)}: Ciclo (mediana) sin datos`,
    );
    expect(marks("verifications")[3]?.getAttribute("aria-label")).toBe(
      `${nov(4)}: Verificaciones que pasan ${percent(0.5, "es")}`,
    );
    expect(marks("cost")[3]?.getAttribute("aria-label")).toBe(
      `${nov(4)}: Coste medido ${usd(2.5, "es")}`,
    );
    expect(marks("pending")[4]?.getAttribute("aria-label")).toBe(
      `${nov(5)}: Pendientes abiertos 3`,
    );
  });

  it("AC1: goes by week above 45 days, and has no minigraph nor table when the view has no trend", async () => {
    const { host, kpi, marks, group, toggle, settle } = await render();
    host.view.set(viewOf(WEEKS));
    await settle();
    expect(marks("closed")).toHaveLength(2);
    expect(group("closed")?.getAttribute("aria-label")).toBe("Cambios cerrados por semana");
    expect(marks("closed")[1]?.getAttribute("aria-label")).toBe(
      `${shortDay(10, 2, "es")}: Cambios cerrados 3`,
    );

    host.view.set(viewOf(undefined));
    await settle();
    for (const id of IDS) expect(kpi(id)?.querySelector("[data-trend]")).toBeNull();
    expect(toggle()).toBeNull();
  });

  it("AC4: «Ver tabla» shows each figure by day, with «—» where it has no value, and «Ocultar tabla» closes it", async () => {
    const { host, marks, toggle, table, head, rows, settle } = await render();
    expect(table()).toBeNull();
    expect(text(toggle())).toBe("Ver tabla");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("false");

    toggle()?.click();
    await settle();
    expect(head()).toEqual([
      "Día",
      "Cambios cerrados",
      "Tareas completadas",
      "Ciclo (mediana)",
      "Verificaciones que pasan",
      "Coste medido",
      "Pendientes abiertos",
    ]);
    const nov = (date: number) => shortDay(10, date, "es");
    expect(rows()).toEqual([
      [nov(1), "0", "0", "—", "—", "—", "1"],
      [nov(2), "0", "0", "—", "—", "—", "2"],
      [nov(3), "0", "0", "—", "—", "—", "2"],
      [
        nov(4),
        "1",
        "1",
        plain(formatDuration(HOUR, "es")),
        percent(0.5, "es"),
        usd(2.5, "es"),
        "2",
      ],
      [nov(5), "0", "0", "—", "—", "—", "3"],
      [nov(6), "2", "2", plain(formatDuration(4 * HOUR, "es")), percent(1, "es"), "—", "2"],
      [nov(7), "0", "0", "—", "—", "—", "2"],
    ]);
    expect(text(toggle())).toBe("Ocultar tabla");
    expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
    // The figures and their minigraphs stay.
    expect(marks("closed")).toHaveLength(7);

    // By week, the first column says so.
    host.view.set(viewOf(WEEKS));
    await settle();
    expect(head()[0]).toBe("Semana del");
    expect(rows().map((row) => row[0])).toEqual([shortDay(9, 26, "es"), shortDay(10, 2, "es")]);

    toggle()?.click();
    await settle();
    expect(table()).toBeNull();
    expect(text(toggle())).toBe("Ver tabla");
  });

  it("AC7: in English, the minigraphs' names and the table", async () => {
    const { host, marks, group, toggle, head, settle } = await render("en");
    expect(group("closed")?.getAttribute("aria-label")).toBe("Changes closed per day");
    expect(marks("closed")[5]?.getAttribute("aria-label")).toBe(
      `${shortDay(10, 6, "en")}: Changes closed 2`,
    );
    expect(marks("cost")[0]?.getAttribute("aria-label")).toBe(
      `${shortDay(10, 1, "en")}: Measured cost no data`,
    );
    expect(text(toggle())).toBe("Show table");
    toggle()?.click();
    await settle();
    expect(text(toggle())).toBe("Hide table");
    expect(head()).toEqual([
      "Day",
      "Changes closed",
      "Tasks completed",
      "Cycle (median)",
      "Verifications passing",
      "Measured cost",
      "Open pending items",
    ]);
    host.view.set(viewOf(WEEKS));
    await settle();
    expect(head()[0]).toBe("Week of");
    expect(group("closed")?.getAttribute("aria-label")).toBe("Changes closed per week");
  });
});
