// SPDX-License-Identifier: Apache-2.0
// The «Panel» page's «Ritmo» and «Personas y agentes» (docs/ui.md): the changes closed by lane
// and the tasks, by day or by week, and a row per person, agent and model that filters the
// panel, in Spanish and in English.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { ChangeKind, StatsQuery, StatsView } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import type { StatsParams } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

const HOUR = 3_600_000;
const TODAY = "2026-11-07";

/** The day `days` after `day`, both YYYY-MM-DD. */
function after(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

const NONE: Readonly<Record<ChangeKind, number>> = {
  quick: 0,
  standard: 0,
  spike: 0,
  retro: 0,
  epic: 0,
};

/** The rhythm of a period: by day, or by week from 10 August; only the last one has data. */
function rhythmOf(period: StatsQuery["period"]): NonNullable<StatsView["rhythm"]> {
  const weekly = period === "90d";
  const count = weekly ? 13 : period === "7d" ? 7 : 30;
  const first = weekly ? "2026-08-10" : after(TODAY, 1 - count);
  return {
    unit: weekly ? "week" : "day",
    buckets: Array.from({ length: count }, (_, index) => {
      const from = after(first, index * (weekly ? 7 : 1));
      const last = index === count - 1;
      return {
        from,
        to: weekly ? (last ? TODAY : after(from, 6)) : from,
        closed: last ? { ...NONE, standard: 2, quick: 1, epic: 1 } : NONE,
        tasks: last ? 5 : 0,
      };
    }),
  };
}

const PEOPLE: NonNullable<StatsView["people"]> = [
  {
    who: { kind: "person", name: "Ana" },
    changes: 40,
    tasks: 120,
    cycle: 2 * HOUR + 15 * 60_000,
    verifications: 0.973,
    sessions: 31,
    cost: 812.5,
  },
  {
    who: { kind: "person", name: "" },
    changes: 2,
    tasks: 0,
    cycle: null,
    verifications: null,
    // AC1: no line of their changes tells its session.
    sessions: null,
    cost: null,
  },
  {
    who: { kind: "agent", name: "claude-code" },
    changes: 38,
    tasks: 118,
    cycle: 2 * HOUR,
    verifications: 0.97,
    sessions: 30,
    cost: 800,
  },
  {
    who: { kind: "model", name: "claude-opus-4" },
    changes: 20,
    tasks: 60,
    cycle: 3 * HOUR,
    verifications: 1,
    sessions: 12,
    cost: 400,
  },
];

/** What the server answers for `params`; «Viejo» stands for a source without the sections. */
function viewFor(params: StatsParams): StatsView {
  const period =
    params.period === "7d" || params.period === "90d" || params.period === "all"
      ? params.period
      : "30d";
  const [kind, name] = (params.who ?? "").split(":");
  const who: StatsQuery["who"] =
    (kind === "person" || kind === "agent" || kind === "model") && name !== undefined
      ? { kind, name }
      : undefined;
  const lane = params.kind === "quick" || params.kind === "standard" ? params.kind : undefined;
  const figure = (value: number | null) => ({ value, previous: value, change: 0 });
  const base: StatsView = {
    query: {
      period,
      ...(who === undefined ? {} : { who }),
      ...(lane === undefined ? {} : { kind: lane }),
    },
    range: { from: rhythmOf(period).buckets[0]?.from ?? TODAY, to: TODAY },
    previous: { from: "2026-09-09", to: "2026-10-08" },
    changes: 42,
    options: PEOPLE.map(({ who: option, changes }) => ({ who: option, changes })),
    summary: {
      closed: figure(40),
      tasks: figure(120),
      cycle: figure(2 * HOUR),
      verifications: { ...figure(0.97), count: 300 },
      cost: { ...figure(812.5), measured: 35, of: 40 },
      pending: figure(12),
    },
  };
  return who?.name === "Viejo" ? base : { ...base, rhythm: rhythmOf(period), people: PEOPLE };
}

/** Every panel the page asked for, in order. */
let asked: StatsParams[] = [];

@Injectable()
class Served extends FixtureData {
  override stats(params: StatsParams): Promise<StatsView> {
    asked.push(params);
    return Promise.resolve(viewFor(params));
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const texts = (elements: Iterable<Element> | undefined) => [...(elements ?? [])].map(text);

async function open(url: string, lang: "es" | "en" = "es") {
  asked = [];
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: Served },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  const router = TestBed.inject(Router);
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await router.navigateByUrl(url);
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-dashboard-page");
  const section = (id: string) => page()?.querySelector<HTMLElement>(`[data-section="${id}"]`);
  const chart = (id: string) =>
    section("rhythm")?.querySelector<HTMLElement>(`[data-chart="${id}"]`);
  const heading = (id: string) => text(chart(id)?.querySelector("[data-chart-heading]"));
  const legend = (id: string) => texts(chart(id)?.querySelectorAll("[data-legend] li"));
  const columns = (id: string) => [
    ...(chart(id)?.querySelectorAll<HTMLButtonElement>("[data-column]") ?? []),
  ];
  const hover = async (id: string, index: number) => {
    columns(id).at(index)?.dispatchEvent(new PointerEvent("pointerenter"));
    await settle();
    const tip = chart(id)?.querySelector("[data-chart-tip]");
    return {
      title: text(tip?.querySelector("[data-tip-title]")),
      rows: texts(tip?.querySelectorAll("[data-tip-row]")),
    };
  };
  const table = async (id: string) => {
    chart(id)?.querySelector<HTMLButtonElement>("[data-chart-toggle]")?.click();
    await settle();
    const found = chart(id)?.querySelector("[data-chart-table]");
    return {
      head: texts(found?.querySelectorAll("thead th")),
      rows: [...(found?.querySelectorAll("tbody tr") ?? [])].map((row) => texts(row.children)),
    };
  };
  const people = () => [...(section("people")?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
  const cell = (row: string, name: string) =>
    text(section("people")?.querySelector(`[data-row="${row}"] [data-cell="${name}"]`));
  const pick = async (row: string) => {
    section("people")?.querySelector<HTMLButtonElement>(`[data-row="${row}"] button`)?.click();
    await settle();
  };
  return {
    element,
    page,
    section,
    chart,
    heading,
    legend,
    columns,
    hover,
    table,
    people,
    cell,
    pick,
    params: () => new URL(router.url, "http://localhost").searchParams,
  };
}

/** What `Intl` writes, with its spaces as the page's text reads them. */
const spaced = (written: string) => written.replace(/\s+/g, " ");
const usd = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value));
const percent = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 }).format(value));
const short = (day: string, lang: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return spaced(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
      new Date(year, month - 1, date),
    ),
  );
};

describe("the «Panel» page's rhythm and people", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: under the figures, «Ritmo» stacks the changes closed per day by lane, with its legend, and the tasks; each column gives its values", async () => {
    const { page, section, heading, legend, columns, hover } = await open("/dashboard");
    const rhythm = section("rhythm");
    expect(text(rhythm?.querySelector("sp-section-divider h2"))).toBe("Ritmo");
    // In the order of the report: the figures, «Ritmo», then «Personas y agentes».
    const figures = page()?.querySelector("[data-kpis]");
    const people = section("people");
    expect(figures && rhythm && figures.compareDocumentPosition(rhythm)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(rhythm && people && rhythm.compareDocumentPosition(people)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    expect(heading("closed")).toBe("Cambios cerrados por día, por carril");
    expect(legend("closed")).toEqual(["Feature", "Quick", "Épica, spike y manual"]);
    expect(columns("closed")).toHaveLength(30);
    expect(await hover("closed", -1)).toEqual({
      title: short(TODAY, "es"),
      rows: ["Feature 2", "Quick 1", "Épica, spike y manual 1", "Total 4"],
    });

    expect(heading("tasks")).toBe("Tareas completadas por día");
    expect(legend("tasks")).toEqual([]);
    expect(columns("tasks")).toHaveLength(30);
    expect(await hover("tasks", -1)).toEqual({ title: short(TODAY, "es"), rows: ["Tareas 5"] });
  });

  it("AC1: above 45 days both go by week, and with a lane only its series stays, in its color", async () => {
    const quarter = await open("/dashboard?period=90d");
    expect(quarter.heading("closed")).toBe("Cambios cerrados por semana, por carril");
    expect(quarter.heading("tasks")).toBe("Tareas completadas por semana");
    expect(quarter.columns("closed")).toHaveLength(13);
    expect((await quarter.hover("closed", 0)).title).toBe(short("2026-08-10", "es"));
    expect((await quarter.table("tasks")).head).toEqual(["Semana del", "Tareas"]);

    const quick = await open("/dashboard?kind=quick");
    expect(quick.legend("closed")).toEqual([]);
    expect((await quick.hover("closed", -1)).rows).toEqual(["Quick 1"]);
    const fills = [
      ...(quick.chart("closed")?.querySelectorAll<SVGElement>("[data-segment]") ?? []),
    ].map((segment) => segment.style.fill);
    expect(fills).toEqual(["var(--color-series-2)"]);

    // A source that does not give the sections yet shows the rest of the panel.
    const older = await open("/dashboard?who=person%3AViejo");
    expect(older.page()?.querySelector("[data-kpis]")).not.toBeNull();
    expect(older.page()?.querySelectorAll("[data-section]")).toHaveLength(0);
  });

  it("AC4: «Ver tabla» on a chart of the panel gives its same data in a table", async () => {
    const { table, columns } = await open("/dashboard");
    const closed = await table("closed");
    expect(closed.head).toEqual(["Día", "Feature", "Quick", "Épica, spike y manual", "Total"]);
    expect(closed.rows).toHaveLength(30);
    expect(closed.rows[0]).toEqual([short("2026-10-09", "es"), "0", "0", "0", "0"]);
    expect(closed.rows.at(-1)).toEqual([short(TODAY, "es"), "2", "1", "1", "4"]);
    expect(columns("closed")).toHaveLength(0);
    // The other chart keeps its own view.
    expect(columns("tasks")).toHaveLength(30);
  });

  it("AC2: «Personas y agentes» has a row per person, agent and model, with its changes, tasks, cycle, verifications, sessions and cost", async () => {
    const { section, people, cell } = await open("/dashboard");
    const divider = section("people")?.querySelector("sp-section-divider");
    expect(text(divider?.querySelector("h2"))).toBe("Personas y agentes");
    expect(text(divider?.querySelector("[data-meta]"))).toBe("4");
    expect(texts(section("people")?.querySelectorAll("thead th"))).toEqual([
      "Quién",
      "Cambios",
      "Tareas",
      "Ciclo (mediana)",
      "Verificaciones que pasan",
      "Sesiones",
      "Coste medido",
    ]);
    expect(people().map((row) => row.dataset.row)).toEqual([
      "person:Ana",
      "person:",
      "agent:claude-code",
      "model:claude-opus-4",
    ]);
    expect(cell("person:Ana", "who")).toBe("Persona Ana");
    expect(cell("person:Ana", "changes")).toBe("40");
    expect(cell("person:Ana", "tasks")).toBe("120");
    expect(cell("person:Ana", "cycle")).toBe("2 h 15 min");
    expect(cell("person:Ana", "verifications")).toBe(percent(0.973, "es"));
    expect(cell("person:Ana", "sessions")).toBe("31");
    expect(cell("person:Ana", "cost")).toBe(usd(812.5, "es"));
    // What nothing measures reads «—».
    expect(cell("person:", "who")).toBe("Persona (sin dato)");
    expect(cell("person:", "cycle")).toBe("—");
    expect(cell("person:", "verifications")).toBe("—");
    expect(cell("person:", "cost")).toBe("—");
    // AC1: «Sesiones» too, when no line of their changes tells its session.
    expect(cell("person:", "sessions")).toBe("—");
    expect(cell("agent:claude-code", "who")).toBe("Agente claude-code");
    expect(cell("model:claude-opus-4", "who")).toBe("Modelo claude-opus-4");
    expect(cell("model:claude-opus-4", "verifications")).toBe(percent(1, "es"));
  });

  it("AC3: choosing a row filters the panel by it, in the address too, and choosing it again goes back to everyone", async () => {
    const { page, params, pick, section } = await open("/dashboard?period=7d");
    const button = (row: string) =>
      section("people")?.querySelector<HTMLButtonElement>(`[data-row="${row}"] button`);
    expect(button("person:Ana")?.getAttribute("aria-pressed")).toBe("false");

    await pick("person:Ana");
    expect(params().get("who")).toBe("person:Ana");
    expect(asked.at(-1)).toEqual({ period: "7d", who: "person:Ana" });
    expect(text(page()?.querySelector("[data-who] [data-select]"))).toBe("Persona: Ana");
    expect(button("person:Ana")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("agent:claude-code")?.getAttribute("aria-pressed")).toBe("false");

    // Another row takes its place; «(sin dato)» too.
    await pick("person:");
    expect(params().get("who")).toBe("person:");

    await pick("person:");
    expect(params().has("who")).toBe(false);
    expect(asked.at(-1)).toEqual({ period: "7d" });
    expect(button("person:")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("AC7: in English, the sections, the charts with their legend, values and table, and the people", async () => {
    const { section, heading, legend, hover, table, cell } = await open("/dashboard", "en");
    expect(text(section("rhythm")?.querySelector("sp-section-divider h2"))).toBe("Rhythm");
    expect(heading("closed")).toBe("Changes closed per day, by lane");
    expect(legend("closed")).toEqual(["Feature", "Quick", "Epic, spike and manual"]);
    expect(heading("tasks")).toBe("Tasks completed per day");
    expect((await hover("tasks", -1)).rows).toEqual(["Tasks 5"]);
    const closed = await table("closed");
    expect(closed.head).toEqual(["Day", "Feature", "Quick", "Epic, spike and manual", "Total"]);
    expect(
      text(section("rhythm")?.querySelector('[data-chart="closed"] [data-chart-toggle]')),
    ).toBe("Show chart");

    expect(text(section("people")?.querySelector("sp-section-divider h2"))).toBe(
      "People and agents",
    );
    expect(texts(section("people")?.querySelectorAll("thead th"))).toEqual([
      "Who",
      "Changes",
      "Tasks",
      "Cycle (median)",
      "Verifications passing",
      "Sessions",
      "Measured cost",
    ]);
    expect(cell("person:Ana", "who")).toBe("Person Ana");
    expect(cell("person:Ana", "cost")).toBe(usd(812.5, "en"));
    expect(cell("person:", "who")).toBe("Person (no data)");
    expect(cell("agent:claude-code", "who")).toBe("Agent claude-code");
    expect(cell("model:claude-opus-4", "who")).toBe("Model claude-opus-4");

    const quarter = await open("/dashboard?period=90d", "en");
    expect(quarter.heading("closed")).toBe("Changes closed per week, by lane");
    expect(quarter.heading("tasks")).toBe("Tasks completed per week");
    expect((await quarter.table("closed")).head[0]).toBe("Week of");
  });
});
