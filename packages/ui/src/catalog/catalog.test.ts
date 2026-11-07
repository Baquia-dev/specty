// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { PHASES } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Commands } from "../components/command-palette";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { formatDuration } from "../data/progress";
import type { ChangeRecord as ChangeRecordForTest } from "../data/records";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { PHASE_LABELS, TOKENS } from "../theme/tokens";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

async function open(path: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES),
      { provide: SpectyData, useClass: FixtureData },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  await TestBed.inject(Router).navigateByUrl(path);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** What `Intl` writes, with its spaces as the page's text reads them. */
const spaced = (written: string) => written.replace(/\s+/g, " ");
/** The catalog's day `date` of November 2026, as its charts label it: «3 nov» or «Nov 3». */
const day = (date: number, lang: string) =>
  spaced(
    new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(
      new Date(2026, 10, date),
    ),
  );
const percent = (value: number, lang: string) =>
  spaced(new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 1 }).format(value));

describe("Catalog", () => {
  beforeEach(() => {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    localStorage.clear();
    localStorage.setItem("specty.lang", "es");
    TestBed.resetTestingModule();
  });

  it("opens on Colors and links every page, marking the current one (AC3)", async () => {
    const { element } = await open("/catalog");
    const links = [...element.querySelectorAll<HTMLAnchorElement>("sp-catalog nav a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/catalog/colors",
      "/catalog/typography",
      "/catalog/foundations",
      "/catalog/components",
      "/catalog/overlays",
      "/catalog/patterns",
      "/catalog/charts",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(element.querySelector("h1")?.textContent).toContain("Colores");
  });

  it("keeps the common page width, with a menu that never wraps and scrolls sideways on a phone", async () => {
    const { element } = await open("/catalog/colors");
    expect(element.querySelector("sp-catalog > div")?.className).toContain("max-w-6xl");
    const list = element.querySelector("sp-catalog nav ul");
    expect(list?.className.split(" ")).toEqual(
      expect.arrayContaining(["overflow-x-auto", "md:flex-col", "md:sticky"]),
    );
    for (const link of element.querySelectorAll("sp-catalog nav a")) {
      expect(link.className).toContain("whitespace-nowrap");
    }
  });

  it("brings the current page into view when the menu scrolls sideways (AC2)", async () => {
    const { element, fixture } = await open("/catalog/colors");
    const menu = element.querySelector<HTMLElement>("sp-catalog nav ul");
    if (menu === null) throw new Error("no menu");
    // jsdom lays out nothing: a 300 px menu showing 100 px, each link 50 px wide.
    let left = 0;
    Object.defineProperties(menu, {
      scrollWidth: { value: 300 },
      clientWidth: { value: 100 },
      scrollLeft: { get: () => left, set: (value: number) => (left = value) },
      getBoundingClientRect: { value: () => ({ left: -left }) },
    });
    const links = [...menu.querySelectorAll<HTMLElement>("a")];
    for (const [index, link] of links.entries()) {
      Object.defineProperties(link, {
        offsetWidth: { value: 50 },
        getBoundingClientRect: { value: () => ({ left: index * 50 - left }) },
      });
    }
    await TestBed.inject(Router).navigateByUrl("/catalog/patterns");
    await fixture.whenStable();
    // The sixth link starts at 250 px: centered, the menu scrolls to 225 px.
    expect(left).toBe(225);
  });

  it("shows the colors as document rows under section dividers, without cards", async () => {
    const { element } = await open("/catalog/colors");
    const page = element.querySelector<HTMLElement>("sp-colors");
    const dividers = [...(page?.querySelectorAll<HTMLElement>("sp-section-divider") ?? [])];
    const label = (divider: HTMLElement) => {
      const meta = divider.querySelector<HTMLElement>("[data-meta]");
      return [divider.querySelector<HTMLElement>("h2"), meta]
        .map((part) => (part === null ? "" : text(part).trim()))
        .join(" ")
        .trim();
    };
    expect(dividers.map(label)).toEqual([
      `Base y acento ${TOKENS.filter((token) => token.group === "color").length}`,
      "Usos del acento",
      "Fases 9",
    ]);
    expect(page?.querySelector(".rounded-xl")).toBeNull();
    const first = page?.querySelector<HTMLElement>("[aria-labelledby=colors-base] li");
    expect(text(first ?? element)).toContain("--color-bg");
    expect(text(first ?? element)).toContain("Fondo de la página");
    expect(first?.className).not.toContain("border");
  });

  it("shows the eight phases with icon and name, and the accent uses (AC4)", async () => {
    const { element } = await open("/catalog/colors");
    const phases = [...element.querySelectorAll<HTMLElement>("[data-phase]")];
    expect(phases.map((item) => item.dataset.phase)).toEqual([...PHASES]);
    for (const [index, phase] of PHASES.entries()) {
      const item = phases[index];
      expect(item?.querySelector("svg")).not.toBeNull();
      expect(text(item ?? element)).toContain(PHASE_LABELS[phase].es);
    }
    expect(text(element)).toContain("Acción primaria");
    expect(element.querySelector("button")).not.toBeNull();
    expect(element.querySelector("main a[href]")).not.toBeNull();
  });

  it("lists every token by name across the three pages (AC3)", async () => {
    const shown = new Set<string>();
    for (const path of ["/catalog/colors", "/catalog/typography", "/catalog/foundations"]) {
      TestBed.resetTestingModule();
      const { element } = await open(path);
      for (const code of element.querySelectorAll("code"))
        shown.add(code.textContent?.trim() ?? "");
    }
    const phaseTokens = PHASES.flatMap((phase) => [
      `--color-phase-${phase}`,
      `--color-phase-${phase}-bg`,
    ]);
    const missing = TOKENS.map((token) => token.name).filter(
      (name) => !phaseTokens.includes(name) && !shown.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("switches theme and language without reloading (AC5)", async () => {
    const { fixture, element } = await open("/catalog/colors");
    const radio = (name: string, value: string) =>
      element.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);

    radio("theme", "dark")?.click();
    radio("lang", "en")?.click();
    await fixture.whenStable();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.lang).toBe("en");
    expect(element.querySelector("h1")?.textContent).toContain("Colors");
    expect(text(element)).toContain("Dark");
    expect(localStorage.getItem("specty.theme")).toBe("dark");
  });

  it("shows the document patterns and the empty state, from the palette too (AC3)", async () => {
    const { element } = await open("/catalog/patterns");
    expect(element.querySelector("h1")?.textContent).toContain("Patrones");
    const list = element.querySelector("[data-example=list]");
    expect(list?.querySelector("sp-section-divider h3")?.textContent).toBe("Criterios");
    expect(list?.querySelector("sp-section-divider [data-meta]")?.textContent).toBe("3");
    const rows = [...(list?.querySelectorAll<HTMLElement>("ol > li") ?? [])];
    expect(rows.map((row) => row.dataset.item)).toEqual(["AC1", "AC2", "AC3"]);
    expect(rows[0]?.className).toContain("hover:bg-text/4");
    expect(list?.querySelector("ol")?.className).toContain("pl-6");
    const empty = element.querySelector("[data-example=empty] sp-empty-state");
    expect(empty?.getAttribute("role")).toBe("status");
    expect(empty?.textContent).toContain("Ningún cambio coincide");
    expect(element.querySelector("[data-example=page]")?.textContent).toContain("max-w-6xl");

    const palette = TestBed.inject(Commands);
    expect(palette.all().some((command) => command.id === "go:catalog/patterns")).toBe(true);
  });

  it("AC6: «Gráficas» shows the columns, the line, the bars and the segmented bar with their states, from the palette too", async () => {
    const { element } = await open("/catalog/charts");
    expect(element.querySelector("h1")?.textContent).toContain("Gráficas");
    const example = (id: string) => element.querySelector<HTMLElement>(`[data-example="${id}"]`);

    // Columns: several series with their legend, and one alone, without it.
    const columns = [...(example("column")?.querySelectorAll("sp-column-chart") ?? [])];
    expect(columns).toHaveLength(2);
    expect(columns[0]?.querySelectorAll("[data-legend] li")).toHaveLength(3);
    expect(columns[1]?.querySelector("[data-legend]")).toBeNull();

    // The line: a gap where a day has no value, and a chart with none at all.
    const lines = [...(example("line")?.querySelectorAll("sp-line-chart") ?? [])];
    expect(lines).toHaveLength(2);
    const marks = [...(lines[0]?.querySelectorAll("[data-mark]") ?? [])];
    expect(marks).toHaveLength(7);
    expect(marks[2]?.getAttribute("aria-label")).toBe(`${day(3, "es")}: Pasan sin datos`);
    expect(lines[0]?.querySelectorAll("[data-point]").length).toBeGreaterThan(0);
    expect(text(lines[1]?.querySelector("[data-none]"))).toBe("Sin datos en el periodo");
    expect(lines[1]?.querySelectorAll("[data-mark]")).toHaveLength(0);

    // The bars: a row with nothing to measure keeps its mark, with no bar.
    const bars = example("bars")?.querySelector("sp-bar-list");
    expect(bars?.querySelectorAll("[data-mark]")).toHaveLength(4);
    expect(bars?.querySelectorAll("[data-bar]")).toHaveLength(3);

    // The segmented bar: a part at 0 is in its key but not drawn, and one with no data at all.
    const segmented = [...(example("segmented")?.querySelectorAll("sp-segmented-bar") ?? [])];
    expect(segmented).toHaveLength(2);
    expect(segmented[0]?.querySelectorAll("[data-part]")).toHaveLength(2);
    expect(segmented[0]?.querySelectorAll("[data-key] li")).toHaveLength(3);
    expect(text(segmented[1]?.querySelector("[data-none]"))).toBe("Sin datos en el periodo");

    const palette = TestBed.inject(Commands);
    expect(palette.all().some((command) => command.id === "go:catalog/charts")).toBe(true);
  });

  it("AC5: the line, the bars and the segmented bar: one tab stop whose marks the keys go through, each with its values in its name and its tooltip", async () => {
    const { fixture, element } = await open("/catalog/charts");
    const press = async (key: string) => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      await fixture.whenStable();
    };
    const tipOf = (chart: Element | null | undefined) => {
      const tip = chart?.querySelector("[data-chart-tip]");
      return {
        title: text(tip?.querySelector("[data-tip-title]")),
        rows: [...(tip?.querySelectorAll("[data-tip-row]") ?? [])].map(text),
      };
    };
    const marksOf = (chart: Element | null | undefined) => [
      ...(chart?.querySelectorAll<HTMLButtonElement>("[data-mark]") ?? []),
    ];

    const line = element.querySelector("[data-example=line] sp-line-chart");
    const points = marksOf(line);
    expect(points.map((mark) => mark.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    points[0]?.focus();
    await fixture.whenStable();
    expect(tipOf(line)).toEqual({ title: day(1, "es"), rows: [`Pasan ${percent(0.95, "es")}`] });
    expect(points[0]?.getAttribute("aria-label")).toBe(
      `${day(1, "es")}: Pasan ${percent(0.95, "es")}`,
    );
    await press("ArrowRight");
    expect(document.activeElement).toBe(points[1]);
    await press("End");
    expect(document.activeElement).toBe(points[6]);
    await press("ArrowLeft");
    expect(document.activeElement).toBe(points[5]);
    expect(tipOf(line).rows).toEqual(["Pasan sin datos"]);
    await press("Home");
    expect(document.activeElement).toBe(points[0]);

    const bars = element.querySelector("[data-example=bars] sp-bar-list");
    const rows = marksOf(bars);
    rows[0]?.focus();
    await fixture.whenStable();
    expect(tipOf(bars)).toEqual({
      title: "Redactar la spec",
      rows: [`Mediana ${formatDuration(25 * 60_000, "es")}`, "Cambios 12"],
    });
    expect(rows[0]?.getAttribute("aria-label")).toBe(
      `Redactar la spec: Mediana ${formatDuration(25 * 60_000, "es")}; Cambios 12`,
    );
    await press("ArrowDown");
    expect(document.activeElement).toBe(rows[1]);
    await press("End");
    expect(document.activeElement).toBe(rows[3]);
    await press("ArrowUp");
    expect(document.activeElement).toBe(rows[2]);

    const segmented = element.querySelector("[data-example=segmented] sp-segmented-bar");
    const parts = marksOf(segmented);
    parts[0]?.focus();
    await fixture.whenStable();
    expect(tipOf(segmented)).toEqual({
      title: "Delegado (el agente)",
      rows: ["Aprobaciones 42", `Parte ${percent(42 / 49, "es")}`],
    });
    await press("ArrowRight");
    expect(document.activeElement).toBe(parts[1]);
    expect(parts[1]?.getAttribute("aria-label")).toBe(
      `Terminal: Aprobaciones 7; Parte ${percent(7 / 49, "es")}`,
    );
    await press("Home");
    expect(document.activeElement).toBe(parts[0]);
  });

  it("AC5: «Ver tabla» shows the line, the bars and the segmented bar as tables with the same data", async () => {
    const { fixture, element } = await open("/catalog/charts");
    const tableOf = async (selector: string) => {
      const chart = element.querySelector(selector);
      chart?.querySelector<HTMLButtonElement>("[data-chart-toggle]")?.click();
      await fixture.whenStable();
      const table = chart?.querySelector("[data-chart-table]");
      return {
        head: [...(table?.querySelectorAll("thead th") ?? [])].map(text),
        rows: [...(table?.querySelectorAll("tbody tr") ?? [])].map((row) =>
          [...row.children].map(text),
        ),
        marks: chart?.querySelectorAll("[data-mark]").length,
      };
    };

    const line = await tableOf("[data-example=line] sp-line-chart");
    expect(line.head).toEqual(["Día", "Pasan"]);
    expect(line.rows).toHaveLength(7);
    expect(line.rows[0]).toEqual([day(1, "es"), percent(0.95, "es")]);
    expect(line.rows[2]).toEqual([day(3, "es"), "—"]);
    expect(line.marks).toBe(0);

    const bars = await tableOf("[data-example=bars] sp-bar-list");
    expect(bars.head).toEqual(["Fase", "Mediana", "Cambios"]);
    expect(bars.rows.map((row) => row[0])).toEqual([
      "Redactar la spec",
      "Revisión hasta aprobar",
      "Implementación",
      "Aceptación y cierre",
    ]);
    expect(bars.rows[3]).toEqual(["Aceptación y cierre", "—", "0"]);

    const segmented = await tableOf("[data-example=segmented] sp-segmented-bar");
    expect(segmented.head).toEqual(["Canal", "Aprobaciones", "Parte"]);
    expect(segmented.rows).toEqual([
      ["Delegado (el agente)", "42", percent(42 / 49, "es")],
      ["Terminal", "7", percent(7 / 49, "es")],
      ["UI", "0", percent(0, "es")],
    ]);
  });

  it("AC8: in English, the charts page, its charts, their tables and their tooltips", async () => {
    localStorage.setItem("specty.lang", "en");
    const { fixture, element } = await open("/catalog/charts");
    expect(element.querySelector("h1")?.textContent).toContain("Charts");
    const line = element.querySelector("[data-example=line] sp-line-chart");
    expect(line?.querySelectorAll("[data-mark]")[2]?.getAttribute("aria-label")).toBe(
      `${day(3, "en")}: Passing no data`,
    );
    const empty = element.querySelectorAll("[data-example=line] sp-line-chart")[1];
    expect(text(empty?.querySelector("[data-none]"))).toBe("No data in the period");
    const keys = element.querySelectorAll(
      "[data-example=segmented] sp-segmented-bar [data-key] li",
    );
    expect(text(keys[0])).toContain("Delegated (the agent)");

    const bars = element.querySelector("[data-example=bars] sp-bar-list");
    const toggle = bars?.querySelector<HTMLButtonElement>("[data-chart-toggle]");
    expect(text(toggle)).toBe("Show table");
    toggle?.click();
    await fixture.whenStable();
    expect([...(bars?.querySelectorAll("[data-chart-table] thead th") ?? [])].map(text)).toEqual([
      "Phase",
      "Median",
      "Changes",
    ]);
    expect(text(bars?.querySelector("[data-chart-table] tbody th"))).toBe("Write the spec");
  });

  it("redirects unknown paths to Colors", async () => {
    const { element } = await open("/catalog/nowhere");
    expect(element.querySelector("h1")?.textContent).toContain("Colores");
  });
});
