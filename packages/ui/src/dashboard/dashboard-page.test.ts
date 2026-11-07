// SPDX-License-Identifier: Apache-2.0
// The «Panel» page (docs/ui.md): the six figures of the cut, its filters in the URL, the
// comparison with the period before and the empty state, in Spanish and in English.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { StatsQuery, StatsView } from "@baquia-dev/specty-core";
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
const RANGES = {
  "7d": { range: { from: "2026-11-01", to: "2026-11-07" }, days: 7 },
  "30d": { range: { from: "2026-10-09", to: "2026-11-07" }, days: 30 },
  "90d": { range: { from: "2026-08-10", to: "2026-11-07" }, days: 90 },
  all: { range: { from: "2026-04-21", to: "2026-11-07" }, days: 0 },
} as const;
const CLOSED = { "7d": 9, "30d": 40, "90d": 100, all: 600 } as const;

/** What the server answers for `params`: fewer closed changes with a filter, none for «Nadie». */
function viewFor(params: StatsParams): StatsView {
  const period =
    params.period === "7d" || params.period === "90d" || params.period === "all"
      ? params.period
      : "30d";
  const [kind, name] = (params.who ?? "").split(":");
  const who =
    (kind === "person" || kind === "agent" || kind === "model") && name !== undefined
      ? { kind, name }
      : undefined;
  const lane = params.kind === "quick" || params.kind === "standard" ? params.kind : undefined;
  const query: StatsQuery = {
    period,
    ...(who === undefined ? {} : { who }),
    ...(lane === undefined ? {} : { kind: lane }),
  };
  const compare = period !== "all";
  const figure = (value: number | null, previous: number | null, change: number | null) =>
    compare ? { value, previous, change } : { value };
  const closed = CLOSED[period] - (who === undefined ? 0 : 1) - (lane === undefined ? 0 : 2);
  return {
    query,
    range: RANGES[period].range,
    ...(compare ? { previous: { from: "2026-09-09", to: "2026-10-08" } } : {}),
    changes: who?.name === "Nadie" ? 0 : closed + 2,
    options: [
      { who: { kind: "person", name: "Ana" }, changes: 40 },
      { who: { kind: "agent", name: "claude-code" }, changes: 38 },
      { who: { kind: "model", name: "" }, changes: 4 },
    ],
    summary: {
      closed: figure(closed, 32, 0.25),
      tasks: figure(120, 150, -0.2),
      cycle: figure(2 * HOUR + 15 * 60_000, 2.5 * HOUR, -0.1),
      verifications: { ...figure(0.973, 0.95, 0.024), count: 300 },
      cost: { ...figure(812.5, null, null), measured: 35, of: 40 },
      pending: figure(12, 10, 0.2),
    },
  };
}

/** Every panel the page asked for, in order. */
let asked: StatsParams[] = [];

/** The prototype, with a panel for each cut it is asked. */
@Injectable()
class Served extends FixtureData {
  override stats(params: StatsParams): Promise<StatsView> {
    asked.push(params);
    return Promise.resolve(viewFor(params));
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

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
  const kpi = (id: string) => page()?.querySelector<HTMLElement>(`[data-kpi="${id}"]`);
  const part = (id: string, name: string) => text(kpi(id)?.querySelector(`[data-${name}]`));
  const choose = async (filter: "who" | "kind", label: string) => {
    page()?.querySelector<HTMLElement>(`[data-${filter}] [data-select]`)?.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>("[role=option]")]
      .find((option) => text(option) === label)
      ?.click();
    await settle();
  };
  return {
    element,
    router,
    settle,
    page,
    kpi,
    part,
    choose,
    kpis: () =>
      [...(page()?.querySelectorAll<HTMLElement>("[data-kpi]") ?? [])].map(
        (tile) => tile.dataset.kpi,
      ),
    tone: (id: string) => kpi(id)?.querySelector<HTMLElement>("[data-delta]")?.dataset.tone,
    params: () => new URL(router.url, "http://localhost").searchParams,
    period: async (value: string) => {
      page()
        ?.querySelector<HTMLInputElement>(`[data-period] input[type="radio"][value="${value}"]`)
        ?.click();
      await settle();
    },
  };
}

/** What `Intl` writes, with its spaces as the page's text reads them. */
const spaced = (written: string) => written.replace(/\s+/g, " ");
const usd = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value));
const percent = (value: number, lang: string, digits = 0) =>
  spaced(
    new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits }).format(value),
  );
const short = (date: Date, lang: string) =>
  spaced(new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(date));

describe("the «Panel» page", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: from the header, gives the six figures of the last 30 days and everyone, each with its change against the 30 days before", async () => {
    const { element, page, kpis, part, tone, settle } = await open("/");
    const link = [...element.querySelectorAll<HTMLAnchorElement>("header nav a")].find(
      (found) => found.getAttribute("href") === "/dashboard",
    );
    expect(text(link)).toBe("Panel");
    link?.click();
    await settle();
    expect(asked.at(-1)).toEqual({});
    expect(text(page()?.querySelector("h1"))).toBe("Panel");
    expect(text(page()?.querySelector("[data-summary]"))).toBe(
      `42 cambios · ${short(new Date(2026, 9, 9), "es")} – ${short(new Date(2026, 10, 7), "es")} · Todos`,
    );
    expect(kpis()).toEqual(["closed", "tasks", "cycle", "verifications", "cost", "pending"]);
    expect(part("closed", "label")).toBe("Cambios cerrados");
    expect(part("closed", "value")).toBe("40");
    expect(part("closed", "delta")).toBe(
      `▲ ${percent(0.25, "es")} frente a los 30 días anteriores`,
    );
    expect(tone("closed")).toBe("good");
    expect(part("tasks", "label")).toBe("Tareas completadas");
    expect(part("tasks", "value")).toBe("120");
    expect(part("tasks", "delta")).toBe(`▼ ${percent(0.2, "es")} frente a los 30 días anteriores`);
    expect(tone("tasks")).toBe("bad");
    expect(part("cycle", "label")).toBe("Ciclo (mediana)");
    expect(part("cycle", "value")).toBe("2 h 15 min");
    expect(part("cycle", "note")).toBe("de crear a cerrar");
    // A shorter cycle, a lower cost and fewer pending items are better.
    expect(tone("cycle")).toBe("good");
    expect(part("verifications", "label")).toBe("Verificaciones que pasan");
    expect(part("verifications", "value")).toBe(percent(0.973, "es", 1));
    expect(part("verifications", "note")).toBe("300 verificaciones de tarea");
    expect(tone("verifications")).toBe("good");
    expect(part("cost", "label")).toBe("Coste medido");
    expect(part("cost", "value")).toBe(usd(812.5, "es"));
    expect(part("cost", "note")).toBe("en 35 de 40 cambios cerrados");
    expect(part("cost", "delta")).toBe("sin datos en los 30 días anteriores");
    expect(part("pending", "label")).toBe("Pendientes abiertos");
    expect(part("pending", "value")).toBe("12");
    expect(part("pending", "note")).toBe("en la memoria");
    expect(tone("pending")).toBe("bad");
  });

  it("AC2: another period, who or lane recalculates the figures, goes in the address and stays on reload", async () => {
    const { part, params, period, choose, page } = await open("/dashboard");
    expect(part("closed", "value")).toBe("40");

    await period("7d");
    expect(params().get("period")).toBe("7d");
    expect(asked.at(-1)).toEqual({ period: "7d" });
    expect(part("closed", "value")).toBe("9");
    expect(part("closed", "delta")).toContain("frente a los 7 días anteriores");

    await choose("who", "Persona: Ana");
    expect(params().get("who")).toBe("person:Ana");
    expect(asked.at(-1)).toEqual({ period: "7d", who: "person:Ana" });
    expect(part("closed", "value")).toBe("8");

    await choose("kind", "Quick");
    expect(params().get("kind")).toBe("quick");
    expect(asked.at(-1)).toEqual({ period: "7d", who: "person:Ana", kind: "quick" });
    expect(part("closed", "value")).toBe("6");
    expect(text(page()?.querySelector("[data-who] [data-select]"))).toBe("Persona: Ana");

    // The model with no data is an option too.
    await choose("who", "Modelo: (sin dato)");
    expect(params().get("who")).toBe("model:");

    // Back to the default period: the address leaves it out.
    await period("30d");
    expect(params().has("period")).toBe(false);

    const reloaded = await open("/dashboard?period=90d&who=person%3AAna&kind=quick");
    expect(asked.at(-1)).toEqual({ period: "90d", who: "person:Ana", kind: "quick" });
    expect(reloaded.part("closed", "value")).toBe("97");
    const checked = reloaded
      .page()
      ?.querySelector<HTMLInputElement>('[data-period] input[type="radio"]:checked');
    expect(checked?.value).toBe("90d");
    expect(text(reloaded.page()?.querySelector("[data-who] [data-select]"))).toBe("Persona: Ana");
    expect(text(reloaded.page()?.querySelector("[data-kind] [data-select]"))).toBe("Quick");
  });

  it("AC3: with «Todo», the figures show no comparison", async () => {
    const { page, part, kpis } = await open("/dashboard?period=all");
    expect(asked.at(-1)).toEqual({ period: "all" });
    expect(kpis()).toHaveLength(6);
    expect(part("closed", "value")).toBe("600");
    expect(page()?.querySelectorAll("[data-delta]")).toHaveLength(0);
    expect(text(page()?.querySelector("[data-summary]"))).toContain(
      `${short(new Date(2026, 3, 21), "es")} – ${short(new Date(2026, 10, 7), "es")}`,
    );
  });

  it("AC4: a cut with no change says so in an empty state, instead of the figures", async () => {
    const { page, kpis } = await open("/dashboard?who=person%3ANadie");
    expect(kpis()).toEqual([]);
    const empty = page()?.querySelector("[data-empty]");
    expect(text(empty)).toContain("Ningún cambio en este periodo");
    // The filters stay, so the person can choose another cut.
    expect(page()?.querySelector("[data-filters]")).not.toBeNull();
  });

  it("AC5: in English, the title, the filters, the figures with their notes and changes, and the empty state", async () => {
    const english = await open("/dashboard", "en");
    expect(text(english.page()?.querySelector("h1"))).toBe("Dashboard");
    const link = [...english.element.querySelectorAll<HTMLAnchorElement>("header nav a")].find(
      (found) => found.getAttribute("href") === "/dashboard",
    );
    expect(text(link)).toBe("Dashboard");
    expect(text(english.page()?.querySelector("[data-summary]"))).toBe(
      `42 changes · ${short(new Date(2026, 9, 9), "en")} – ${short(new Date(2026, 10, 7), "en")} · Everyone`,
    );
    const filters = text(english.page()?.querySelector("[data-filters]"));
    for (const word of ["Period", "7 days", "30 days", "90 days", "All time", "View by", "Lane"]) {
      expect(filters).toContain(word);
    }
    expect(english.part("closed", "label")).toBe("Changes closed");
    expect(english.part("closed", "delta")).toBe(
      `▲ ${percent(0.25, "en")} vs. the previous 30 days`,
    );
    expect(english.part("tasks", "label")).toBe("Tasks completed");
    expect(english.part("cycle", "label")).toBe("Cycle (median)");
    expect(english.part("cycle", "note")).toBe("from created to closed");
    expect(english.part("verifications", "label")).toBe("Verifications passing");
    expect(english.part("verifications", "note")).toBe("300 task verifications");
    expect(english.part("cost", "label")).toBe("Measured cost");
    expect(english.part("cost", "value")).toBe(usd(812.5, "en"));
    expect(english.part("cost", "note")).toBe("in 35 of 40 closed changes");
    expect(english.part("cost", "delta")).toBe("no data in the previous 30 days");
    expect(english.part("pending", "label")).toBe("Open pending items");
    expect(english.part("pending", "note")).toBe("in the memory");

    const empty = await open("/dashboard?who=person%3ANadie", "en");
    expect(text(empty.page()?.querySelector("[data-empty]"))).toContain("No change in this period");
  });
});
