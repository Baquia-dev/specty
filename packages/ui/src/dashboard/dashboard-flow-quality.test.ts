// SPDX-License-Identifier: Apache-2.0
// The «Panel» page's «Flujo y esperas» and «Calidad» (docs/ui.md): the time of each phase, who
// approves the specs and how long the person waits, and what Specty checked on completing the
// tasks and on accepting, in Spanish and in English.
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TODAY = "2026-11-07";

/** The day `days` after `day`, both YYYY-MM-DD. */
function after(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** The days or weeks of a period: the last two have verifications, the rest none. */
function bucketsOf(period: StatsQuery["period"]) {
  const weekly = period === "90d";
  const count = weekly ? 13 : period === "7d" ? 7 : 30;
  const first = weekly ? "2026-08-10" : after(TODAY, 1 - count);
  return Array.from({ length: count }, (_, index) => {
    const from = after(first, index * (weekly ? 7 : 1));
    const last = index === count - 1;
    return {
      from,
      to: weekly ? (last ? TODAY : after(from, 6)) : from,
      passed: last ? 3 : index === count - 2 ? 2 : 0,
      total: last ? 4 : index === count - 2 ? 2 : 0,
    };
  });
}

const FLOW: NonNullable<StatsView["flow"]> = {
  phases: [
    { phase: "spec", median: 25 * MINUTE, changes: 40 },
    { phase: "review", median: 2 * HOUR, changes: 40 },
    { phase: "implementation", median: 90 * MINUTE, changes: 38 },
    { phase: "closing", median: null, changes: 0 },
  ],
  approvals: { delegated: 42, tty: 7, ui: 1 },
  wait: { median: 3 * HOUR, approvals: 8 },
  revisions: 1.4,
  sessions: { mean: 1.5, changes: 30 },
};

/** A cut where nothing measures the approvals, the wait, the revisions nor the sessions. */
const QUIET: NonNullable<StatsView["flow"]> = {
  ...FLOW,
  approvals: { delegated: 0, tty: 0, ui: 0 },
  wait: { median: null, approvals: 0 },
  revisions: null,
  sessions: { mean: null, changes: 0 },
};

function qualityOf(period: StatsQuery["period"], failing: boolean): StatsView["quality"] {
  return {
    unit: period === "90d" ? "week" : "day",
    buckets: bucketsOf(period),
    full: { failed: 2, total: 9 },
    tests: { proposed: 14, locked: 2 },
    risks: 3,
    longFiles: 1,
    removedAssertions: 5,
    worst: failing
      ? [
          { id: "20261105-guard-y-alcance", failed: 3, total: 5 },
          { id: "20261106-otro-cambio", failed: 1, total: 4 },
        ]
      : [],
  };
}

/** What the server answers: «Viejo» stands for a source without the sections, «Nadie» for a quiet cut. */
function viewFor(params: StatsParams): StatsView {
  const period =
    params.period === "7d" || params.period === "90d" || params.period === "all"
      ? params.period
      : "30d";
  const name = params.who?.startsWith("person:") ? params.who.slice(7) : undefined;
  const figure = (value: number | null) => ({ value, previous: value, change: 0 });
  const buckets = bucketsOf(period);
  const base: StatsView = {
    query: { period, ...(name === undefined ? {} : { who: { kind: "person", name } }) },
    range: { from: buckets[0]?.from ?? TODAY, to: TODAY },
    changes: 42,
    options: [
      { who: { kind: "person", name: "Ana" }, changes: 40 },
      { who: { kind: "person", name: "Nadie" }, changes: 1 },
      { who: { kind: "person", name: "Viejo" }, changes: 1 },
    ],
    summary: {
      closed: figure(40),
      tasks: figure(120),
      cycle: figure(2 * HOUR),
      verifications: { ...figure(0.97), count: 300 },
      cost: { ...figure(812.5), measured: 35, of: 40 },
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
  if (name === "Viejo") return base;
  const quiet = name === "Nadie";
  return { ...base, flow: quiet ? QUIET : FLOW, quality: qualityOf(period, !quiet) };
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
const short = (day: string, lang: string) => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return spaced(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
      new Date(year, month - 1, date),
    ),
  );
};

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
  const marks = (id: string) => [
    ...(chart(id)?.querySelectorAll<HTMLButtonElement>("[data-mark]") ?? []),
  ];
  const names = (id: string) => marks(id).map((mark) => mark.getAttribute("aria-label"));
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
  return { page, section, chart, marks, names, focus, table, figure };
}

describe("the «Panel» page's flow and quality", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: «Flujo y esperas», after «Ritmo», shows each phase's median in horizontal bars, with how many changes under the focus", async () => {
    const { section, chart, marks, names, focus } = await open("/dashboard");
    const flow = section("flow");
    expect(text(flow?.querySelector("sp-section-divider h2"))).toBe("Flujo y esperas");
    // In the order the person chose: «Ritmo», «Flujo y esperas», «Calidad», then the people.
    const order = ["rhythm", "flow", "quality", "people"].map(section);
    for (const [index, current] of order.slice(1).entries()) {
      const before = order[index];
      expect(before && current && before.compareDocumentPosition(current)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }

    expect(text(chart("phases")?.querySelector("[data-chart-heading]"))).toBe(
      "Tiempo por fase (mediana por cambio)",
    );
    expect(names("phases")).toEqual([
      `Redactar la spec: Mediana ${formatDuration(25 * MINUTE, "es")}; Cambios 40`,
      `Revisión hasta aprobar: Mediana ${formatDuration(2 * HOUR, "es")}; Cambios 40`,
      `Implementación: Mediana ${formatDuration(90 * MINUTE, "es")}; Cambios 38`,
      "Aceptación y cierre: Mediana —; Cambios 0",
    ]);
    // A phase no change went through has no bar.
    expect(chart("phases")?.querySelectorAll("[data-bar]")).toHaveLength(3);
    expect(marks("phases").map((mark) => mark.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(await focus("phases", 1)).toEqual({
      title: "Revisión hasta aprobar",
      rows: [`Mediana ${formatDuration(2 * HOUR, "es")}`, "Cambios 40"],
    });
  });

  it("AC1: a source that does not give the sections shows the rest of the panel", async () => {
    const { section } = await open("/dashboard?who=person:Viejo");
    expect(section("rhythm")).toBeTruthy();
    expect(section("flow")).toBeFalsy();
    expect(section("quality")).toBeFalsy();
  });

  it("AC2: «Quién aprueba la spec» splits the approvals by channel, with their number and share, beside the wait, the revisions and the sessions", async () => {
    const { chart, names, focus, figure } = await open("/dashboard");
    const approvals = chart("approvals");
    expect(text(approvals?.querySelector("[data-chart-heading]"))).toBe("Quién aprueba la spec");
    expect(texts(approvals?.querySelectorAll("[data-key] li"))).toEqual([
      `Delegado (el agente) 42 · ${percent(0.84, "es")}`,
      `Terminal 7 · ${percent(0.14, "es")}`,
      `UI 1 · ${percent(0.02, "es")}`,
    ]);
    expect(approvals?.querySelectorAll("[data-part]")).toHaveLength(3);
    expect(names("approvals")[1]).toBe(`Terminal: Aprobaciones 7; Parte ${percent(0.14, "es")}`);
    expect(await focus("approvals", 0)).toEqual({
      title: "Delegado (el agente)",
      rows: ["Aprobaciones 42", `Parte ${percent(0.84, "es")}`],
    });

    expect(figure("wait")).toEqual([
      "Espera a la persona",
      formatDuration(3 * HOUR, "es"),
      "mediana de 8 aprobaciones suyas",
    ]);
    expect(figure("revisions")).toEqual([
      "Revisiones por spec",
      "1,4",
      "propuestas por aprobación",
    ]);
    expect(figure("sessions")).toEqual([
      "Sesiones por cambio",
      "1,5",
      "conversaciones de agente, en 30 cambios",
    ]);
  });

  it("AC2: with nothing to measure, the approvals say so and the figures show «—»", async () => {
    const { chart, figure } = await open("/dashboard?who=person:Nadie");
    expect(text(chart("approvals")?.querySelector("[data-none]"))).toBe("Sin datos en el periodo");
    expect(figure("wait")[1]).toBe("—");
    expect(figure("revisions")[1]).toBe("—");
    expect(figure("sessions")[1]).toBe("—");
  });

  it("AC3: «Calidad» draws the share of task verifications that pass per day, «sin datos» where there was none, and its signals", async () => {
    const { section, chart, names, focus, figure } = await open("/dashboard");
    expect(text(section("quality")?.querySelector("sp-section-divider h2"))).toBe("Calidad");
    expect(text(chart("verifications")?.querySelector("[data-chart-heading]"))).toBe(
      "Verificaciones de tarea que pasan, por día",
    );
    const days = bucketsOf("30d").map((bucket) => short(bucket.from, "es"));
    expect(names("verifications")).toHaveLength(30);
    expect(names("verifications")[0]).toBe(`${days[0]}: Pasan sin datos`);
    expect(names("verifications")[28]).toBe(`${days[28]}: Pasan ${percent(1, "es")}`);
    expect(await focus("verifications", 29)).toEqual({
      title: days[29],
      rows: [`Pasan ${percent(0.75, "es")}`],
    });

    expect(figure("full")).toEqual([
      "Verificación completa fallida",
      "2 de 9",
      "al aceptar o incorporar main",
    ]);
    expect(figure("tests")).toEqual(["Tests de contrato", "14", "2 bloqueados en rojo (bug)"]);
    expect(figure("risks")).toEqual([
      "Riesgos detectados",
      "3",
      "hallazgos en los diffs de las tareas",
    ]);
    expect(figure("long")).toEqual(["Archivos largos", "1", "por encima de lines.warn"]);
    expect(figure("assertions")).toEqual(["Aserciones quitadas", "5", "de tests que ya existían"]);
  });

  it("AC3: in a longer period the verifications go per week", async () => {
    const { chart, names } = await open("/dashboard?period=90d");
    expect(text(chart("verifications")?.querySelector("[data-chart-heading]"))).toBe(
      "Verificaciones de tarea que pasan, por semana",
    );
    expect(names("verifications")).toHaveLength(13);
  });

  it("AC4: the changes with most task verifications failed, «✕ N de M» in the risk tone, each linked to its change", async () => {
    const { section } = await open("/dashboard");
    const worst = section("quality")?.querySelector("[data-worst]");
    const rows = [...(worst?.querySelectorAll<HTMLElement>("[data-change]") ?? [])];
    expect(rows.map((row) => row.dataset.change)).toEqual([
      "20261105-guard-y-alcance",
      "20261106-otro-cambio",
    ]);
    expect(rows[0]?.querySelector("a")?.getAttribute("href")).toBe(
      "/changes/20261105-guard-y-alcance",
    );
    const failed = rows[0]?.querySelector<HTMLElement>("[data-failed]");
    expect(text(failed)).toBe("3 de 5");
    expect(failed?.className).toContain("text-phase-cancelled");
    expect(failed?.querySelector("svg")).toBeTruthy();
  });

  it("AC4: when no task verification failed, the list says so", async () => {
    const { section } = await open("/dashboard?who=person:Nadie");
    const quality = section("quality");
    expect(quality?.querySelectorAll("[data-worst] [data-change]")).toHaveLength(0);
    expect(text(quality?.querySelector("[data-worst-none]"))).toBe(
      "Ninguna verificación de tarea falló en el periodo.",
    );
  });

  it("AC5: the bars, the segmented bar and the line of the panel show their data in a table", async () => {
    const { table } = await open("/dashboard");
    const phases = await table("phases");
    expect(phases.head).toEqual(["Fase", "Mediana", "Cambios"]);
    expect(phases.rows[3]).toEqual(["Aceptación y cierre", "—", "0"]);
    const approvals = await table("approvals");
    expect(approvals.head).toEqual(["Canal", "Aprobaciones", "Parte"]);
    expect(approvals.rows[0]).toEqual(["Delegado (el agente)", "42", percent(0.84, "es")]);
    const verifications = await table("verifications");
    expect(verifications.head).toEqual(["Día", "Pasan"]);
    expect(verifications.rows[0]?.[1]).toBe("—");
    expect(verifications.rows[29]?.[1]).toBe(percent(0.75, "es"));
  });

  it("AC8: in English, the sections, their charts, figures, table and tooltip", async () => {
    const { section, chart, names, focus, figure, table } = await open("/dashboard", "en");
    expect(text(section("flow")?.querySelector("sp-section-divider h2"))).toBe("Flow and waits");
    expect(text(section("quality")?.querySelector("sp-section-divider h2"))).toBe("Quality");
    expect(text(chart("phases")?.querySelector("[data-chart-heading]"))).toBe(
      "Time per phase (median per change)",
    );
    expect(names("phases").map((name) => name?.split(":")[0])).toEqual([
      "Write the spec",
      "Review until approved",
      "Implementation",
      "Acceptance and closing",
    ]);
    expect(await focus("approvals", 0)).toEqual({
      title: "Delegated (the agent)",
      rows: ["Approvals 42", `Share ${percent(0.84, "en")}`],
    });
    expect(figure("wait")[0]).toBe("Wait for the person");
    expect(figure("full")).toEqual([
      "Full verification failed",
      "2 of 9",
      "on accepting or merging main",
    ]);
    expect(text(chart("verifications")?.querySelector("[data-chart-heading]"))).toBe(
      "Task verifications passing, per day",
    );
    expect(names("verifications")[0]).toMatch(/: Passing no data$/);
    const phases = await table("phases");
    expect(phases.head).toEqual(["Phase", "Median", "Changes"]);

    const quiet = await open("/dashboard?who=person:Nadie", "en");
    expect(text(quiet.section("quality")?.querySelector("[data-worst-none]"))).toBe(
      "No task verification failed in the period.",
    );
  });
});
