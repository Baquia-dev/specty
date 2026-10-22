// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { Inbox } from "./inbox";

/** The Inbox on its own, deriving the sample changes in the same thread, as the worker would. */
async function open() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SpectyData, useClass: FixtureData },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Inbox);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const rows = () => [...element.querySelectorAll<HTMLElement>("sp-inbox-row")];
  const sections = () =>
    [...element.querySelectorAll<HTMLElement>("section")].map(
      (section) =>
        `${text(section.querySelector("h2"))} ${text(section.querySelector("[data-meta]"))}`,
    );
  const typeIn = async (value: string) => {
    const input = element.querySelector<HTMLInputElement>("sp-inbox-toolbar input");
    if (input === null) throw new Error("no search");
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await settle();
  };
  return { element, settle, rows, sections, typeIn };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const short = (id: string | undefined) => id?.replace(/^\d+-/, "");

describe("Inbox toolbar", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("pins the search and the phases while scrolling, with a line only once pinned (AC2)", async () => {
    let fire: IntersectionObserverCallback = () => undefined;
    let options: IntersectionObserverInit | undefined;
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback, init?: IntersectionObserverInit) {
        fire = callback;
        options = init;
      }
      observe(): void {}
      disconnect(): void {}
    }
    Object.assign(window, { IntersectionObserver: FakeObserver });
    try {
      const { element, settle } = await open();
      const bar = () => element.querySelector<HTMLElement>("sp-inbox-toolbar");
      const scroll = async (ratio: number, top: number) => {
        const entry = {
          intersectionRatio: ratio,
          boundingClientRect: { top },
          rootBounds: { top: 0 },
        } as IntersectionObserverEntry;
        fire([entry], {} as IntersectionObserver);
        await settle();
      };
      // Search and phases are pinned; grouping and sorting stay in the header.
      expect(bar()?.querySelector("input[type=search]")).not.toBeNull();
      expect(bar()?.querySelector("[data-phases]")).not.toBeNull();
      expect(bar()?.querySelector("[data-group]")).toBeNull();
      expect(element.querySelector("header [data-group]")).not.toBeNull();
      expect(element.querySelector("header [data-sort]")).not.toBeNull();
      expect(bar()?.className).toContain("sticky");
      expect(options?.rootMargin).toBe("-1px 0px 0px 0px");

      expect(bar()?.className).toContain("border-transparent");
      await scroll(0.99, 0);
      expect(bar()?.hasAttribute("data-pinned")).toBe(true);
      expect(bar()?.className).toContain("border-border");
      await scroll(1, 160);
      expect(bar()?.hasAttribute("data-pinned")).toBe(false);
      expect(bar()?.className).toContain("border-transparent");
      // Partly below the bottom edge is not pinned either.
      await scroll(0.5, 700);
      expect(bar()?.hasAttribute("data-pinned")).toBe(false);
    } finally {
      Reflect.deleteProperty(window, "IntersectionObserver");
    }
  });

  it("filters by phase, each with its count; the chosen one again shows them all (AC3)", async () => {
    const { element, rows, settle } = await open();
    const chips = () => [...element.querySelectorAll<HTMLButtonElement>("[data-phases] button")];
    expect(chips().map(text)).toEqual([
      "Todas 9",
      "Borrador 1",
      "Revisión 2",
      "Implementación 2",
      "Aceptación 1",
      "Cierre 1",
      "Terminado 1",
      "Cancelado 1",
    ]);
    chips()[2]?.click();
    await settle();
    expect(rows().map((item) => short(item.dataset.id))).toEqual([
      "justificar-faltas",
      "evolucion-trimestre",
    ]);
    expect(chips()[2]?.getAttribute("aria-pressed")).toBe("true");
    chips()[2]?.click();
    await settle();
    expect(rows()).toHaveLength(9);
  });

  it("groups by phase or not at all, and sorts by title (AC4)", async () => {
    const { element, sections, rows, settle } = await open();
    const groups = () => [...element.querySelectorAll<HTMLButtonElement>("[data-group] button")];
    groups()[1]?.click();
    await settle();
    expect(sections()).toEqual([
      "Borrador 1",
      "Revisión 2",
      "Implementación 2",
      "Aceptación 1",
      "Cierre 1",
      "Terminado 1",
      "Cancelado 1",
    ]);
    groups()[2]?.click();
    // Sorting uses the select of the design system, not the system's dropdown.
    expect(element.querySelector("select")).toBeNull();
    element.querySelector<HTMLElement>("[data-sort] [data-select]")?.click();
    await settle();
    [...document.querySelectorAll<HTMLElement>("[role=option]")]
      .find((option) => text(option) === "Título, de la A a la Z")
      ?.click();
    await settle();
    expect(text(element.querySelector("[data-sort] [data-select]"))).toBe("Título, de la A a la Z");
    expect(localStorage.getItem("specty.inbox.sort")).toBe("title");
    expect(sections()).toEqual(["Todos los cambios 9"]);
    const titles = rows().map((item) => text(item.querySelector("a")));
    expect(titles).toEqual(titles.toSorted((a, b) => a.localeCompare(b, "es")));
  });

  it("says when nothing matches, how many are shown, and clears the filters (AC5)", async () => {
    const { element, rows, settle, typeIn } = await open();
    await typeIn("correo");
    // The count rides in the pinned bar, next to the phases.
    const shown = element.querySelector("sp-inbox-toolbar [data-shown]");
    expect(text(shown)).toBe("1 de 9 cambios · Limpiar filtros");
    await typeIn("nada parecido");
    const empty = element.querySelector("sp-empty-state");
    expect(text(empty?.querySelector("h2"))).toBe("Ningún cambio coincide");
    empty?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(rows()).toHaveLength(9);
    expect(element.querySelector("[data-shown]")).toBeNull();
  });
});
