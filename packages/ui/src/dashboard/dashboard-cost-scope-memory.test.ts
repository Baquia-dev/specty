// SPDX-License-Identifier: Apache-2.0
// The «Panel» page's «Coste y tokens», «Alcance e integraciones» and «Memoria» (docs/ui.md): what
// the changes of the period cost and in what, how far their work went out of its plan and what
// merging main took, and what was noted in the memory, in Spanish and in English.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { StatsQuery, StatsView } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { formatDuration } from "../data/progress";
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

/** The days or weeks of a period. */
function bucketsOf(period: StatsQuery["period"]) {
  const weekly = period === "90d";
  const count = weekly ? 13 : period === "7d" ? 7 : 30;
  const first = weekly ? "2026-08-10" : after(TODAY, 1 - count);
  return Array.from({ length: count }, (_, index) => {
    const from = after(first, index * (weekly ? 7 : 1));
    const last = index === count - 1;
    return { from, to: weekly ? (last ? TODAY : after(from, 6)) : from };
  });
}

type Cost = NonNullable<StatsView["cost"]>;
type Scope = NonNullable<StatsView["scope"]>;
type Memory = NonNullable<StatsView["memory"]>;

/** The cost of a period: the last two days or weeks with some, the rest none. */
function costOf(period: StatsQuery["period"]): Cost {
  const buckets = bucketsOf(period);
  return {
    unit: period === "90d" ? "week" : "day",
    buckets: buckets.map((bucket, index) => ({
      ...bucket,
      cost: index === buckets.length - 1 ? 12.3456 : index === buckets.length - 2 ? 3.5 : 0,
    })),
    tokens: {
      input: 1_200,
      output: 150_539,
      cacheWrite: 289_712,
      cacheRead: 44_842_086,
      calls: 189,
      changes: 38,
    },
    lanes: [
      { kind: "standard", cost: 700.25, changes: 30 },
      { kind: "quick", cost: 112.25, changes: 5 },
    ],
    top: [
      {
        id: "20261105-guard-y-alcance",
        kind: "standard",
        cost: 41.5,
        tasks: 6,
        cycle: 27 * HOUR,
        sessions: 3,
      },
      // AC2: no line of it tells its session.
      { id: "20261106-abierto", kind: "quick", cost: 2.25, tasks: 0, cycle: null, sessions: null },
    ],
  };
}

/** A cut where no change has its usage measured. */
function unmeasured(period: StatsQuery["period"]): Cost {
  return {
    ...costOf(period),
    buckets: bucketsOf(period).map((bucket) => ({ ...bucket, cost: 0 })),
    tokens: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, calls: 0, changes: 0 },
    lanes: [],
    top: [],
  };
}

const SCOPE: Scope = {
  requests: { auto: 73, approved: 95, rejected: 1 },
  integrations: { verify: 55, conflicts: 63, changes: 80 },
  adjustments: { requested: 44, changes: 30 },
};

const MEMORY: Memory = {
  entries: 25,
  statuses: { open: 8, taken: 2, done: 12, "drop-proposed": 1, dropped: 2 },
  kinds: { pending: 15, improvement: 6, reminder: 1, decision: 2, lesson: 1 },
};

/** The sections of a cut with one of everything. */
const ONE = {
  scope: {
    requests: { auto: 0, approved: 1, rejected: 0 },
    integrations: { verify: 0, conflicts: 1, changes: 1 },
    adjustments: { requested: 1, changes: 1 },
  },
  memory: {
    entries: 1,
    statuses: { open: 1, taken: 0, done: 0, "drop-proposed": 0, dropped: 0 },
    kinds: { pending: 1, improvement: 0, reminder: 0, decision: 0, lesson: 0 },
  },
} satisfies { scope: Scope; memory: Memory };

/** The sections of a quiet cut: nothing decided, stopped, adjusted nor noted. */
const QUIET = {
  scope: {
    requests: { auto: 0, approved: 0, rejected: 0 },
    integrations: { verify: 0, conflicts: 0, changes: 0 },
    adjustments: { requested: 0, changes: 0 },
  },
  memory: {
    entries: 0,
    statuses: { open: 0, taken: 0, done: 0, "drop-proposed": 0, dropped: 0 },
    kinds: { pending: 0, improvement: 0, reminder: 0, decision: 0, lesson: 0 },
  },
} satisfies { scope: Scope; memory: Memory };

/**
 * What the server answers: «Viejo» stands for a source without the sections, «Nadie» for a cut
 * with nothing measured nor noted, «Tokens» for tokens without a cost, «Uno» for one of each.
 */
function viewFor(params: StatsParams): StatsView {
  const period =
    params.period === "7d" || params.period === "90d" || params.period === "all"
      ? params.period
      : "30d";
  const name = params.who?.startsWith("person:") ? params.who.slice(7) : undefined;
  const figure = (value: number | null) => ({ value, previous: value, change: 0 });
  const buckets = bucketsOf(period);
  const measured = name === "Uno" ? { measured: 1, of: 1 } : { measured: 35, of: 40 };
  const base: StatsView = {
    query: { period, ...(name === undefined ? {} : { who: { kind: "person", name } }) },
    range: { from: buckets[0]?.from ?? TODAY, to: TODAY },
    changes: 42,
    options: ["Ana", "Nadie", "Tokens", "Uno", "Viejo"].map((person) => ({
      who: { kind: "person" as const, name: person },
      changes: 1,
    })),
    summary: {
      closed: figure(40),
      tasks: figure(120),
      cycle: figure(2 * HOUR),
      verifications: { ...figure(0.97), count: 300 },
      cost: { ...figure(812.5), ...measured },
      pending: figure(12),
    },
    rhythm: {
      unit: period === "90d" ? "week" : "day",
      buckets: buckets.map(({ from, to }) => ({
        from,
        to,
        closed: { quick: 0, standard: 1, spike: 0, retro: 0, epic: 0 },
        tasks: 1,
      })),
    },
    quality: {
      unit: period === "90d" ? "week" : "day",
      buckets: buckets.map(({ from, to }) => ({ from, to, passed: 1, total: 1 })),
      full: { failed: 0, total: 1 },
      tests: { proposed: 0, locked: 0 },
      risks: 0,
      longFiles: 0,
      removedAssertions: 0,
      worst: [],
    },
    people: [
      {
        who: { kind: "person", name: "Ana" },
        changes: 40,
        tasks: 120,
        cycle: 2 * HOUR,
        verifications: 0.97,
        sessions: 31,
        cost: 812.5,
      },
    ],
  };
  switch (name) {
    case "Viejo":
      return base;
    case "Nadie":
      return { ...base, cost: unmeasured(period), ...QUIET };
    case "Tokens":
      return { ...base, cost: { ...costOf(period), ...lanesless(period) }, ...QUIET };
    case "Uno":
      return {
        ...base,
        cost: { ...costOf(period), tokens: { ...costOf(period).tokens, changes: 1 } },
        ...ONE,
      };
    default:
      return { ...base, cost: costOf(period), scope: SCOPE, memory: MEMORY };
  }
}

/** Tokens measured, but no cost: no day, lane nor change has one. */
function lanesless(period: StatsQuery["period"]): Pick<Cost, "buckets" | "lanes" | "top"> {
  return {
    buckets: bucketsOf(period).map((bucket) => ({ ...bucket, cost: 0 })),
    lanes: [],
    top: [],
  };
}

@Injectable()
class Served extends FixtureData {
  override stats(params: StatsParams): Promise<StatsView> {
    return Promise.resolve(viewFor(params));
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const texts = (elements: Iterable<Element> | undefined) => [...(elements ?? [])].map(text);

/** What `Intl` writes, with its spaces as the page's text reads them. */
const spaced = (written: string) => written.replace(/\s+/g, " ");
const percent = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 }).format(value));
const usd = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value));
const compact = (value: number, lang: string) =>
  spaced(
    new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: 1 }).format(value),
  );
const number = (value: number, lang: string) => spaced(new Intl.NumberFormat(lang).format(value));
const short = (day: string, lang: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return spaced(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
      new Date(year, month - 1, date),
    ),
  );
};

/** The tokens of the bar, in its order, and the share of each. */
const TOKENS = [44_842_086, 289_712, 150_539];
const share = (value: number) => value / TOKENS.reduce((all, one) => all + one, 0);

async function open(url: string, lang: "es" | "en" = "es") {
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
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-dashboard-page");
  const section = (id: string) => page()?.querySelector<HTMLElement>(`[data-section="${id}"]`);
  const chart = (id: string) => page()?.querySelector<HTMLElement>(`[data-chart="${id}"]`);
  /** A chart's marks: its columns, bars or parts. */
  const marks = (id: string) => [
    ...(chart(id)?.querySelectorAll<HTMLButtonElement>("[data-mark], [data-column]") ?? []),
  ];
  const names = (id: string) => marks(id).map((mark) => mark.getAttribute("aria-label"));
  const heading = (id: string) => text(chart(id)?.querySelector("[data-chart-heading]"));
  const focus = async (id: string, index: number) => {
    marks(id).at(index)?.focus();
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
  /** A figure's label, value and note. */
  const figure = (id: string) => {
    const found = page()?.querySelector(`[data-figure="${id}"]`);
    return [
      text(found?.querySelector("[data-label]")),
      text(found?.querySelector("[data-value]")),
      text(found?.querySelector("[data-note]")),
    ];
  };
  const keys = (id: string) => texts(chart(id)?.querySelectorAll("[data-key] li"));
  return { page, section, chart, marks, names, heading, focus, table, figure, keys };
}

describe("the «Panel» page's cost, scope and memory", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: «Coste y tokens», after «Calidad», says on how many changes the cost was measured and draws the cost per day in columns", async () => {
    const { section, chart, names, heading, focus, marks } = await open("/dashboard");
    const cost = section("cost");
    expect(text(cost?.querySelector("sp-section-divider h2"))).toBe("Coste y tokens");
    // In the order the person chose: «Calidad», «Coste y tokens», «Alcance e integraciones»,
    // «Memoria», then the people.
    const order = ["quality", "cost", "scope", "memory", "people"].map(section);
    for (const [index, current] of order.slice(1).entries()) {
      const before = order[index];
      expect(before && current && before.compareDocumentPosition(current)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(text(cost?.querySelector("[data-measured]"))).toBe(
      "Medido con ccusage al cerrar cada cambio: coste en 35 de 40 cambios cerrados.",
    );

    expect(heading("cost")).toBe("Coste por día (USD)");
    const days = bucketsOf("30d").map((bucket) => short(bucket.from, "es"));
    expect(names("cost")).toHaveLength(30);
    expect(names("cost")[0]).toBe(`${days[0]}: USD 0`);
    // Each day's cost, to the cent.
    expect(names("cost")[28]).toBe(`${days[28]}: USD ${number(3.5, "es")}`);
    expect(names("cost")[29]).toBe(`${days[29]}: USD ${number(12.35, "es")}`);
    expect(chart("cost")?.querySelectorAll("[data-segment]")).toHaveLength(2);
    expect(marks("cost").map((mark) => mark.tabIndex)).toEqual([
      0,
      ...Array.from({ length: 29 }, () => -1),
    ]);
    expect(await focus("cost", 29)).toEqual({
      title: days[29],
      rows: [`USD ${number(12.35, "es")}`],
    });
  });

  it("AC1: the tokens by type in a segmented bar, the calls to the model, the cost by lane and the costliest changes", async () => {
    const { section, chart, names, heading, keys } = await open("/dashboard");
    const cost = section("cost");
    expect(heading("tokens")).toBe("Tokens por tipo");
    expect(keys("tokens")).toEqual([
      `Lectura de caché ${compact(44_842_086, "es")} · ${percent(share(44_842_086), "es")}`,
      `Escritura de caché ${compact(289_712, "es")} · ${percent(share(289_712), "es")}`,
      `Salida ${compact(150_539, "es")} · ${percent(share(150_539), "es")}`,
    ]);
    expect(chart("tokens")?.querySelectorAll("[data-part]")).toHaveLength(3);
    expect(text(cost?.querySelector("[data-calls]"))).toBe(
      `Llamadas al modelo: 189, en 38 cambios. Tokens de entrada sin caché: ${compact(1_200, "es")}.`,
    );

    expect(heading("lanes")).toBe("Coste por carril");
    expect(names("lanes")).toEqual([
      `Feature: Coste ${usd(700.25, "es")}; Cambios 30`,
      `Quick: Coste ${usd(112.25, "es")}; Cambios 5`,
    ]);

    expect(text(cost?.querySelector("h3[data-top-heading]"))).toBe("Los cambios más caros");
    const top = cost?.querySelector("[data-top]");
    expect(texts(top?.querySelectorAll("thead th"))).toEqual([
      "Cambio",
      "Carril",
      "Tareas",
      "Ciclo",
      "Sesiones",
      "Coste",
    ]);
    const rows = [...(top?.querySelectorAll<HTMLElement>("tbody [data-change]") ?? [])];
    expect(rows.map((row) => row.dataset.change)).toEqual([
      "20261105-guard-y-alcance",
      "20261106-abierto",
    ]);
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe(
      "/changes/20261105-guard-y-alcance",
    );
    expect(texts(rows[0]?.children)).toEqual([
      "20261105-guard-y-alcance",
      "Feature",
      "6",
      formatDuration(27 * HOUR, "es"),
      "3",
      usd(41.5, "es"),
    ]);
    // AC2: «—» in «Sesiones» when no line of the change tells its session.
    expect(texts(rows[1]?.children)).toEqual([
      "20261106-abierto",
      "Quick",
      "0",
      "—",
      "—",
      usd(2.25, "es"),
    ]);
    expect(cost?.querySelector("[data-top-none]")).toBeNull();
  });

  it("AC1: in a longer period the cost goes per week", async () => {
    const { heading, names } = await open("/dashboard?period=90d");
    expect(heading("cost")).toBe("Coste por semana (USD)");
    expect(names("cost")).toHaveLength(13);
  });

  it("AC2: with no usage measured the section says so instead of the charts, and with tokens but no cost the costliest say none has one", async () => {
    const quiet = await open("/dashboard?who=person:Nadie");
    const none = quiet.section("cost");
    expect(text(none?.querySelector("[data-cost-none]"))).toBe(
      "Ningún cambio del periodo tiene su consumo medido.",
    );
    expect(quiet.chart("cost")).toBeNull();
    expect(quiet.chart("tokens")).toBeNull();
    expect(quiet.chart("lanes")).toBeNull();
    expect(none?.querySelector("[data-top]")).toBeNull();

    const tokens = await open("/dashboard?who=person:Tokens");
    const measured = tokens.section("cost");
    expect(measured?.querySelector("[data-cost-none]")).toBeNull();
    expect(tokens.chart("tokens")?.querySelectorAll("[data-part]")).toHaveLength(3);
    expect(tokens.chart("lanes")).toBeNull();
    expect(measured?.querySelector("[data-top]")).toBeNull();
    expect(text(measured?.querySelector("[data-top-none]"))).toBe(
      "Ningún cambio del periodo tiene el coste medido.",
    );
  });

  it("AC3: «Alcance e integraciones» splits the scope requests by decision and the merges of main that stopped by reason, beside the adjustments", async () => {
    const { section, heading, keys, names, figure } = await open("/dashboard");
    const scope = section("scope");
    expect(text(scope?.querySelector("sp-section-divider h2"))).toBe("Alcance e integraciones");

    expect(heading("requests")).toBe("Solicitudes de alcance");
    const decided = 73 + 95 + 1;
    expect(keys("requests")).toEqual([
      `Automáticas 73 · ${percent(73 / decided, "es")}`,
      `Aprobadas 95 · ${percent(95 / decided, "es")}`,
      `Rechazadas 1 · ${percent(1 / decided, "es")}`,
    ]);
    expect(names("requests")[1]).toBe(
      `Aprobadas: Solicitudes 95; Parte ${percent(95 / decided, "es")}`,
    );
    expect(text(scope?.querySelector('[data-note="requests"]'))).toBe("169 decididas");

    expect(heading("integrations")).toBe("Incorporaciones de main que pararon");
    expect(keys("integrations")).toEqual([
      `La verificación falló 55 · ${percent(55 / 118, "es")}`,
      `Conflictos 63 · ${percent(63 / 118, "es")}`,
    ]);
    expect(text(scope?.querySelector('[data-note="integrations"]'))).toBe("118 en 80 cambios");

    expect(figure("adjustments")).toEqual(["Ajustes pedidos", "44", "en 30 cambios"]);
  });

  it("AC3: one of each says it in the singular, and nothing decided nor stopped says there is no data", async () => {
    const one = await open("/dashboard?who=person:Uno");
    expect(text(one.section("scope")?.querySelector('[data-note="integrations"]'))).toBe(
      "1 en 1 cambio",
    );
    expect(one.figure("adjustments")).toEqual(["Ajustes pedidos", "1", "en 1 cambio"]);
    expect(text(one.section("cost")?.querySelector("[data-measured]"))).toBe(
      "Medido con ccusage al cerrar cada cambio: coste en 1 de 1 cambio cerrado.",
    );
    expect(text(one.section("cost")?.querySelector("[data-calls]"))).toBe(
      `Llamadas al modelo: 189, en 1 cambio. Tokens de entrada sin caché: ${compact(1_200, "es")}.`,
    );

    const quiet = await open("/dashboard?who=person:Nadie");
    expect(text(quiet.chart("requests")?.querySelector("[data-none]"))).toBe(
      "Sin datos en el periodo",
    );
    expect(text(quiet.chart("integrations")?.querySelector("[data-none]"))).toBe(
      "Sin datos en el periodo",
    );
    expect(text(quiet.section("scope")?.querySelector('[data-note="requests"]'))).toBe(
      "0 decididas",
    );
    expect(quiet.figure("adjustments")).toEqual(["Ajustes pedidos", "0", "en 0 cambios"]);
  });

  it("AC4: «Memoria» says how many entries were noted and draws them by status and by kind, the most first", async () => {
    const { section, heading, names } = await open("/dashboard");
    const memory = section("memory");
    expect(text(memory?.querySelector("sp-section-divider h2"))).toBe("Memoria");
    expect(text(memory?.querySelector("[data-noted]"))).toBe("25 entradas anotadas en el periodo.");
    expect(heading("statuses")).toBe("Por estado");
    // On a tie, in the order an entry goes through.
    expect(names("statuses")).toEqual([
      "Hechas: Entradas 12",
      "Abiertas: Entradas 8",
      "Tomadas por un cambio: Entradas 2",
      "Descartadas: Entradas 2",
      "Propuestas para descartar: Entradas 1",
    ]);
    expect(heading("kinds")).toBe("Por tipo");
    expect(names("kinds")).toEqual([
      "Pendientes: Entradas 15",
      "Mejoras: Entradas 6",
      "Decisiones: Entradas 2",
      "Recordatorios: Entradas 1",
      "Lecciones: Entradas 1",
    ]);
  });

  it("AC4: one entry says it in the singular, and none says so without charts", async () => {
    const one = await open("/dashboard?who=person:Uno");
    expect(text(one.section("memory")?.querySelector("[data-noted]"))).toBe(
      "1 entrada anotada en el periodo.",
    );
    const quiet = await open("/dashboard?who=person:Nadie");
    expect(text(quiet.section("memory")?.querySelector("[data-noted]"))).toBe(
      "Ninguna entrada anotada en el periodo.",
    );
    expect(quiet.chart("statuses")).toBeNull();
    expect(quiet.chart("kinds")).toBeNull();
  });

  it("AC4: a source that does not give the sections shows the rest of the panel", async () => {
    const { section } = await open("/dashboard?who=person:Viejo");
    expect(section("quality")).toBeTruthy();
    expect(section("cost")).toBeFalsy();
    expect(section("scope")).toBeFalsy();
    expect(section("memory")).toBeFalsy();
  });

  it("AC5: each chart of the three sections gives its data in a table, and the keyboard goes through its marks", async () => {
    const { table } = await open("/dashboard");
    const cost = await table("cost");
    expect(cost.head).toEqual(["Día", "USD"]);
    expect(cost.rows[0]?.[1]).toBe("0");
    expect(cost.rows[29]?.[1]).toBe(number(12.35, "es"));
    const tokens = await table("tokens");
    expect(tokens.head).toEqual(["Tipo", "Tokens", "Parte"]);
    expect(tokens.rows[0]).toEqual([
      "Lectura de caché",
      compact(44_842_086, "es"),
      percent(share(44_842_086), "es"),
    ]);
    const lanes = await table("lanes");
    expect(lanes.head).toEqual(["Carril", "Coste", "Cambios"]);
    expect(lanes.rows[1]).toEqual(["Quick", usd(112.25, "es"), "5"]);
    const requests = await table("requests");
    expect(requests.head).toEqual(["Decisión", "Solicitudes", "Parte"]);
    expect(requests.rows[2]?.slice(0, 2)).toEqual(["Rechazadas", "1"]);
    const integrations = await table("integrations");
    expect(integrations.head).toEqual(["Motivo", "Incorporaciones", "Parte"]);
    const statuses = await table("statuses");
    expect(statuses.head).toEqual(["Estado", "Entradas"]);
    expect(statuses.rows[0]).toEqual(["Hechas", "12"]);
    const kinds = await table("kinds");
    expect(kinds.head).toEqual(["Tipo", "Entradas"]);
    expect(kinds.rows[4]).toEqual(["Lecciones", "1"]);

    const fresh = await open("/dashboard");
    expect(fresh.marks("statuses").map((mark) => mark.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(await fresh.focus("statuses", 1)).toEqual({
      title: "Abiertas",
      rows: ["Entradas 8"],
    });
    expect(await fresh.focus("tokens", 0)).toEqual({
      title: "Lectura de caché",
      rows: [`Tokens ${compact(44_842_086, "es")}`, `Parte ${percent(share(44_842_086), "es")}`],
    });
    expect(await fresh.focus("lanes", 0)).toEqual({
      title: "Feature",
      rows: [`Coste ${usd(700.25, "es")}`, "Cambios 30"],
    });
  });

  it("AC8: in English, the sections, their charts, notes, tables and tooltips", async () => {
    const { section, heading, keys, names, figure, focus, table } = await open("/dashboard", "en");
    const cost = section("cost");
    expect(text(cost?.querySelector("sp-section-divider h2"))).toBe("Cost and tokens");
    expect(text(cost?.querySelector("[data-measured]"))).toBe(
      "Measured with ccusage on closing each change: cost in 35 of 40 closed changes.",
    );
    expect(heading("cost")).toBe("Cost per day (USD)");
    expect(heading("tokens")).toBe("Tokens by type");
    expect(keys("tokens")[0]).toBe(
      `Cache read ${compact(44_842_086, "en")} · ${percent(share(44_842_086), "en")}`,
    );
    expect(keys("tokens").map((key) => key.split(" ")[0])).toEqual(["Cache", "Cache", "Output"]);
    expect(text(cost?.querySelector("[data-calls]"))).toBe(
      `Model calls: 189, in 38 changes. Uncached input tokens: ${compact(1_200, "en")}.`,
    );
    expect(heading("lanes")).toBe("Cost by lane");
    expect(names("lanes")[0]).toBe(`Feature: Cost ${usd(700.25, "en")}; Changes 30`);
    expect(text(cost?.querySelector("h3[data-top-heading]"))).toBe("The costliest changes");
    expect(texts(cost?.querySelectorAll("[data-top] thead th"))).toEqual([
      "Change",
      "Lane",
      "Tasks",
      "Cycle",
      "Sessions",
      "Cost",
    ]);

    expect(text(section("scope")?.querySelector("sp-section-divider h2"))).toBe(
      "Scope and integrations",
    );
    expect(heading("requests")).toBe("Scope requests");
    expect(keys("requests").map((key) => key.split(" ")[0])).toEqual([
      "Automatic",
      "Approved",
      "Rejected",
    ]);
    expect(text(section("scope")?.querySelector('[data-note="requests"]'))).toBe("169 decided");
    expect(heading("integrations")).toBe("Merges of main that stopped");
    expect(keys("integrations")[0]).toBe(`Verification failed 55 · ${percent(55 / 118, "en")}`);
    expect(keys("integrations")[1]).toBe(`Conflicts 63 · ${percent(63 / 118, "en")}`);
    expect(text(section("scope")?.querySelector('[data-note="integrations"]'))).toBe(
      "118 on 80 changes",
    );
    expect(figure("adjustments")).toEqual(["Adjustments requested", "44", "on 30 changes"]);

    expect(text(section("memory")?.querySelector("sp-section-divider h2"))).toBe("Memory");
    expect(text(section("memory")?.querySelector("[data-noted]"))).toBe(
      "25 entries noted in the period.",
    );
    expect(heading("statuses")).toBe("By status");
    expect(names("statuses").map((name) => name?.split(":")[0])).toEqual([
      "Done",
      "Open",
      "Taken by a change",
      "Dropped",
      "Proposed to drop",
    ]);
    expect(heading("kinds")).toBe("By kind");
    expect(names("kinds").map((name) => name?.split(":")[0])).toEqual([
      "Pending items",
      "Improvements",
      "Decisions",
      "Reminders",
      "Lessons",
    ]);
    expect(await focus("kinds", 0)).toEqual({ title: "Pending items", rows: ["Entries 15"] });
    const statuses = await table("statuses");
    expect(statuses.head).toEqual(["Status", "Entries"]);

    const quiet = await open("/dashboard?who=person:Nadie", "en");
    expect(text(quiet.section("cost")?.querySelector("[data-cost-none]"))).toBe(
      "No change of the period has its usage measured.",
    );
    expect(text(quiet.section("memory")?.querySelector("[data-noted]"))).toBe(
      "No entry noted in the period.",
    );
    const tokens = await open("/dashboard?who=person:Tokens", "en");
    expect(text(tokens.section("cost")?.querySelector("[data-top-none]"))).toBe(
      "No change of the period has its cost measured.",
    );
    const one = await open("/dashboard?who=person:Uno", "en");
    expect(text(one.section("memory")?.querySelector("[data-noted]"))).toBe(
      "1 entry noted in the period.",
    );
    expect(text(one.section("cost")?.querySelector("[data-measured]"))).toBe(
      "Measured with ccusage on closing each change: cost in 1 of 1 closed change.",
    );
  });
});
