// SPDX-License-Identifier: Apache-2.0
// The «Cambios» section of the «Panel» (docs/ui.md): the changes of the cut in a table, with its
// search, its order by column, its pages and a link to each change, in Spanish and in English.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type {
  StatsChange,
  StatsChangesPage,
  StatsPeriod,
  StatsQuery,
  StatsView,
} from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { agentName } from "../data/agent-name";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { formatDuration } from "../data/progress";
import { type ChangeRecord, SpectyData } from "../data/records";
import type { StatsChangesParams, StatsParams } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

const PANEL = "20261105-panel-de-cambios";
const OPEN = "20261106-tabla-abierta";
const CLOSED_AT = new Date(2026, 10, 5, 10);

/** Thirty changes: a closed one with every figure, an open one and 28 more. */
const CHANGES: readonly StatsChange[] = [
  {
    id: PANEL,
    title: "Panel de cambios",
    kind: "standard",
    size: "M",
    agent: "claude-code",
    closed: CLOSED_AT.toISOString(),
    tasks: 3,
    cycle: 3_600_000,
    failed: 1,
    cost: 1.5,
  },
  { id: OPEN, title: "Tabla abierta", kind: "quick", tasks: 0, failed: 0 },
  ...Array.from(
    { length: 28 },
    (_, index): StatsChange => ({
      id: `202610${String(index + 1).padStart(2, "0")}-cambio-${index + 1}`,
      title: `Cambio ${index + 1}`,
      kind: "standard",
      size: "S",
      agent: "codex",
      closed: new Date(2026, 9, index + 1, 12).toISOString(),
      tasks: 1,
      cycle: 60_000,
      failed: 0,
      cost: 0.1,
    }),
  ),
];

/** The cut the server understood from `params`. */
function queryOf(params: StatsParams): StatsQuery {
  const periods: readonly StatsPeriod[] = ["7d", "30d", "90d", "all"];
  const period = periods.find((known) => known === params.period) ?? "30d";
  return { period };
}

/** The panel of a cut with thirty changes. */
function viewFor(params: StatsParams): StatsView {
  const figure = { value: 1 };
  return {
    query: queryOf(params),
    range: { from: "2026-10-09", to: "2026-11-07" },
    changes: CHANGES.length,
    options: [],
    summary: {
      closed: figure,
      tasks: figure,
      cycle: figure,
      verifications: { ...figure, count: 1 },
      cost: { ...figure, measured: 1, of: 1 },
      pending: figure,
    },
  };
}

/** Every page of the table the section asked for, in order. */
let asked: StatsChangesParams[] = [];

/** The prototype, with the panel and the pages of its table: found by title or id, in order. */
@Injectable()
class Served extends FixtureData {
  override stats(params: StatsParams): Promise<StatsView> {
    return Promise.resolve(viewFor(params));
  }

  override statsChanges(params: StatsChangesParams): Promise<StatsChangesPage> {
    asked.push(params);
    const wanted = params.q.toLowerCase();
    const found = CHANGES.filter((change) =>
      `${change.title} ${change.id}`.toLowerCase().includes(wanted),
    );
    return Promise.resolve({
      query: queryOf(params),
      range: { from: "2026-10-09", to: "2026-11-07" },
      table: {
        q: params.q,
        sort: params.sort,
        dir: params.dir,
        offset: params.offset,
        limit: params.limit,
        lang: params.lang,
      },
      changes: found.slice(params.offset, params.offset + params.limit),
      total: found.length,
    });
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** A header's label, without the arrow of its order. */
const label = (element: Element | null | undefined) => text(element).replace(/[↑↓]/g, "").trim();

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
  const section = () => element.querySelector<HTMLElement>("sp-dashboard-page [data-changes]");
  const row = (id: string) => section()?.querySelector<HTMLElement>(`[data-change="${id}"]`);
  const cell = (id: string, column: string) =>
    row(id)?.querySelector<HTMLElement>(`[data-cell="${column}"]`);
  const button = (name: "previous" | "next") =>
    section()?.querySelector<HTMLButtonElement>(`[data-${name}] button`);
  const sorter = (column: string) =>
    section()?.querySelector<HTMLButtonElement>(`[data-sort="${column}"]`);
  return {
    router,
    settle,
    section,
    row,
    cell,
    button,
    sorter,
    rows: () =>
      [...(section()?.querySelectorAll<HTMLElement>("[data-change]") ?? [])].map(
        (item) => item.dataset.change,
      ),
    headers: () =>
      [...(section()?.querySelectorAll<HTMLElement>("th") ?? [])].map((header) => label(header)),
    order: (column: string) => sorter(column)?.closest("th")?.getAttribute("aria-sort") ?? null,
    pageLine: () => text(section()?.querySelector("[data-page]")),
    search: async (value: string) => {
      const input = section()?.querySelector<HTMLInputElement>("input[data-search]");
      if (input === null || input === undefined) throw new Error("no search");
      input.value = value;
      input.dispatchEvent(new Event("input"));
      await settle();
    },
    press: async (target: HTMLElement | null | undefined) => {
      target?.click();
      await settle();
    },
  };
}

/** What `Intl` writes, with its spaces as the page's text reads them. */
const spaced = (written: string) => written.replace(/\s+/g, " ");
const usd = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "currency", currency: "USD" }).format(value));
const short = (date: Date, lang: string) =>
  spaced(new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(date));

const FIRST: Partial<StatsChangesParams> = {
  period: "30d",
  q: "",
  sort: "closed",
  dir: "desc",
  offset: 0,
  limit: 25,
};

describe("the «Cambios» section of the «Panel»", () => {
  it("AC1: lists the changes of the cut, 25 a page, each with its close, title and id, lane, size, agent, tasks, cycle, failed verifications and cost", async () => {
    const page = await open("/dashboard");
    expect(asked.at(-1)).toEqual({ ...FIRST, lang: "es" });
    expect(text(page.section()?.querySelector("h2"))).toBe("Cambios");
    expect(page.headers()).toEqual([
      "Cerrado",
      "Cambio",
      "Carril",
      "Tamaño",
      "Agente",
      "Tareas",
      "Ciclo",
      "Fallidas",
      "Coste",
    ]);
    expect(page.rows()).toHaveLength(25);
    expect(page.rows().slice(0, 2)).toEqual([PANEL, OPEN]);

    expect(text(page.cell(PANEL, "closed"))).toBe(short(CLOSED_AT, "es"));
    expect(text(page.cell(PANEL, "title"))).toContain("Panel de cambios");
    expect(text(page.cell(PANEL, "title"))).toContain(PANEL);
    expect(text(page.cell(PANEL, "kind"))).toBe("Feature");
    expect(text(page.cell(PANEL, "size"))).toBe("M");
    expect(text(page.cell(PANEL, "agent"))).toBe(agentName("claude-code"));
    expect(text(page.cell(PANEL, "tasks"))).toBe("3");
    expect(text(page.cell(PANEL, "cycle"))).toBe(formatDuration(3_600_000, "es"));
    expect(text(page.cell(PANEL, "failed"))).toBe("1");
    // A failure goes with an icon, in the tone of risk.
    const failed = page.cell(PANEL, "failed")?.querySelector<HTMLElement>("[data-failed]");
    expect(failed?.querySelector("svg")).not.toBeNull();
    expect(failed?.classList.contains("text-phase-cancelled")).toBe(true);
    expect(text(page.cell(PANEL, "cost"))).toBe(usd(1.5, "es"));

    // An open change: no close, cycle nor cost; no failure to mark.
    expect(text(page.cell(OPEN, "closed"))).toBe("—");
    expect(text(page.cell(OPEN, "kind"))).toBe("Quick");
    expect(text(page.cell(OPEN, "size"))).toBe("—");
    expect(text(page.cell(OPEN, "agent"))).toBe("—");
    expect(text(page.cell(OPEN, "cycle"))).toBe("—");
    expect(text(page.cell(OPEN, "failed"))).toBe("0");
    expect(page.cell(OPEN, "failed")?.querySelector("[data-failed]")).toBeNull();
    expect(text(page.cell(OPEN, "cost"))).toBe("—");
  });

  it("AC2: finds the changes by title or id from the first page, and says when none matches", async () => {
    const page = await open("/dashboard");
    await page.press(page.button("next"));
    expect(asked.at(-1)).toMatchObject({ offset: 25 });

    await page.search("tabla");
    expect(asked.at(-1)).toEqual({ ...FIRST, q: "tabla", lang: "es" });
    expect(page.rows()).toEqual([OPEN]);
    expect(page.pageLine()).toBe("Página 1 de 1");

    await page.search("20261105");
    expect(page.rows()).toEqual([PANEL]);

    await page.search("nada de esto");
    expect(page.rows()).toEqual([]);
    const none = text(page.section()?.querySelector("[data-none]"));
    expect(none).toContain("Ningún cambio");
    expect(none).toContain("nada de esto");
  });

  it("AC3: sorts by the column whose header is pressed, the other way when pressed again, and says the order to screen readers", async () => {
    const page = await open("/dashboard");
    expect(page.order("closed")).toBe("descending");
    expect(page.order("title")).toBeNull();

    await page.press(page.button("next"));
    await page.press(page.sorter("title"));
    expect(asked.at(-1)).toEqual({ ...FIRST, sort: "title", dir: "asc", lang: "es" });
    expect(page.order("title")).toBe("ascending");
    expect(page.order("closed")).toBeNull();

    await page.press(page.sorter("title"));
    expect(asked.at(-1)).toMatchObject({ sort: "title", dir: "desc", offset: 0 });
    expect(page.order("title")).toBe("descending");

    await page.press(page.sorter("cost"));
    expect(asked.at(-1)).toMatchObject({ sort: "cost", dir: "desc", offset: 0 });
    expect(page.order("cost")).toBe("descending");

    await page.press(page.sorter("agent"));
    expect(asked.at(-1)).toMatchObject({ sort: "agent", dir: "asc" });
    expect(page.order("agent")).toBe("ascending");
  });

  it("AC4: says the page of how many, goes to the next and back, and another cut goes back to the first", async () => {
    const page = await open("/dashboard");
    expect(page.pageLine()).toBe("Página 1 de 2");
    expect(page.button("previous")?.disabled).toBe(true);
    expect(page.button("next")?.disabled).toBe(false);

    await page.press(page.button("next"));
    expect(asked.at(-1)).toEqual({ ...FIRST, offset: 25, lang: "es" });
    expect(page.pageLine()).toBe("Página 2 de 2");
    expect(page.rows()).toHaveLength(5);
    expect(page.button("next")?.disabled).toBe(true);
    expect(page.button("previous")?.disabled).toBe(false);

    await page.press(page.button("previous"));
    expect(asked.at(-1)).toMatchObject({ offset: 0 });
    expect(page.pageLine()).toBe("Página 1 de 2");

    await page.press(page.button("next"));
    await page.press(
      page
        .section()
        ?.closest("sp-dashboard-page")
        ?.querySelector<HTMLInputElement>('[data-period] input[type="radio"][value="7d"]'),
    );
    expect(asked.at(-1)).toEqual({ ...FIRST, period: "7d", lang: "es" });
    expect(page.pageLine()).toBe("Página 1 de 2");
  });

  it("AC5: opens the change of a row, from its title or from anywhere in the row", async () => {
    const page = await open("/dashboard");
    const link = page.cell(PANEL, "title")?.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe(`/changes/${PANEL}`);
    await page.press(link);
    expect(page.router.url).toBe(`/changes/${PANEL}`);

    await page.router.navigateByUrl("/dashboard");
    await page.settle();
    await page.press(page.cell(OPEN, "tasks"));
    expect(page.router.url).toBe(`/changes/${OPEN}`);
  });

  it("AC7: shows the section, its search, headers, pages and states in English", async () => {
    const page = await open("/dashboard", "en");
    expect(asked.at(-1)).toEqual({ ...FIRST, lang: "en" });
    expect(text(page.section()?.querySelector("h2"))).toBe("Changes");
    expect(page.section()?.querySelector<HTMLInputElement>("input[data-search]")?.placeholder).toBe(
      "Search by title or id",
    );
    expect(page.headers()).toEqual([
      "Closed",
      "Change",
      "Lane",
      "Size",
      "Agent",
      "Tasks",
      "Cycle",
      "Failed",
      "Cost",
    ]);
    expect(text(page.cell(PANEL, "closed"))).toBe(short(CLOSED_AT, "en"));
    expect(text(page.cell(PANEL, "cycle"))).toBe(formatDuration(3_600_000, "en"));
    expect(text(page.cell(PANEL, "cost"))).toBe(usd(1.5, "en"));
    expect(page.pageLine()).toBe("Page 1 of 2");
    expect(text(page.button("previous"))).toBe("Previous");
    expect(text(page.button("next"))).toBe("Next");

    await page.search("nothing like this");
    const none = text(page.section()?.querySelector("[data-none]"));
    expect(none).toContain("No change");
    expect(none).toContain("nothing like this");
  });
});
