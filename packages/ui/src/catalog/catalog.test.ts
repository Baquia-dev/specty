// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { PHASES } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Commands } from "../components/command-palette";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
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

const text = (element: HTMLElement) => element.textContent?.replace(/\s+/g, " ") ?? "";

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
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("page");
    expect(element.querySelector("h1")?.textContent).toContain("Colores");
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

  it("redirects unknown paths to Colors", async () => {
    const { element } = await open("/catalog/nowhere");
    expect(element.querySelector("h1")?.textContent).toContain("Colores");
  });
});
