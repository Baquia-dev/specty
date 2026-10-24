// SPDX-License-Identifier: Apache-2.0
import { Location } from "@angular/common";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import type { ChangeRecord as ChangeRecordForTest } from "../data/records";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { Preferences } from "../theme/preferences";
import { APP_ROUTES } from "./routes";
import { Shell } from "./shell";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

async function open(path: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES),
      { provide: SpectyData, useClass: FixtureData },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(path);
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  return { fixture, element: fixture.nativeElement as HTMLElement, router, settle };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("Shell", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("offers the Inbox, the catalog, the palette, theme and language in one header (AC8)", async () => {
    const { element, router } = await open("/catalog/colors");
    const main = [...element.querySelectorAll<HTMLAnchorElement>("header nav a")];
    expect(main.map((link) => link.getAttribute("href"))).toEqual(["/", "/catalog"]);
    expect(main[1]?.getAttribute("aria-current")).toBe("page");
    expect(element.querySelector("header sp-kbd")).not.toBeNull();
    expect(element.querySelectorAll("header input[name=theme]")).toHaveLength(3);
    expect(element.querySelectorAll("header input[name=lang]")).toHaveLength(2);
    expect(element.querySelector("sp-catalog")).not.toBeNull();
    expect(router.url).toBe("/catalog/colors");
  });

  it("keeps the header on one line, theme and language in a preferences menu (AC1, AC2)", async () => {
    const { element, settle } = await open("/");
    const header = element.querySelector("header");
    expect(header?.className).toContain("flex-nowrap");
    // Theme, language and, as the sample source knows it, delegated mode.
    expect(header?.querySelectorAll("fieldset")).toHaveLength(3);
    // A native popover, opened by its own button and hidden by the browser while closed.
    const trigger = element.querySelector<HTMLButtonElement>("sp-preferences-menu button");
    const panel = element.querySelector<HTMLElement>("sp-preferences-menu [popover]");
    expect(trigger?.getAttribute("aria-label")).toBe("Preferencias");
    expect(trigger?.getAttribute("popovertarget")).toBe(panel?.id);
    expect(panel?.className.split(" ")).not.toContain("flex");
    expect([...(panel?.querySelectorAll("legend") ?? [])].map(text)).toEqual([
      "Tema",
      "Idioma",
      "Modo delegado",
    ]);
    expect([...(panel?.querySelectorAll("label") ?? [])].map(text)).toEqual([
      "Claro",
      "Oscuro",
      "Sistema",
      "Español",
      "English",
    ]);
    // While open, its button stays raised.
    const toggle = (newState: string) =>
      panel?.dispatchEvent(Object.assign(new Event("toggle"), { newState }));
    toggle("open");
    await settle();
    expect(trigger?.className.split(" ")).toContain("bg-surface");
    toggle("closed");
    await settle();
    expect(trigger?.className.split(" ")).not.toContain("bg-surface");
  });

  it("shrinks the search to an icon on a phone, which still opens the palette (AC3)", async () => {
    const { element, settle } = await open("/");
    const icon = element.querySelector<HTMLButtonElement>("header sp-icon-button button");
    expect(icon?.getAttribute("aria-label")).toBe("Buscar o ejecutar");
    expect(icon?.closest("span")?.className).toContain("sm:hidden");
    expect(element.querySelector("header sp-button")?.closest("span")?.className).toContain(
      "hidden sm:flex",
    );
    icon?.click();
    await settle();
    expect(document.querySelectorAll("[role=option]").length).toBeGreaterThan(0);
  });

  it("scrolls only a positioned content area, which ends every page with the same room (AC1, AC2)", async () => {
    for (const url of ["/", "/catalog"]) {
      const { element } = await open(url);
      const main = element.querySelector("main");
      const classes = main?.className.split(" ") ?? [];
      // Absolute content (screen-reader text) stays inside it instead of scrolling the page.
      expect(classes, url).toEqual(
        expect.arrayContaining(["relative", "overflow-y-auto", "pb-16"]),
      );
      TestBed.resetTestingModule();
    }
  });

  it("switches theme and language without reloading (AC8)", async () => {
    const { fixture, element } = await open("/catalog");
    element.querySelector<HTMLInputElement>("input[name=theme][value=dark]")?.click();
    element.querySelector<HTMLInputElement>("input[name=lang][value=en]")?.click();
    await fixture.whenStable();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(TestBed.inject(Preferences).lang()).toBe("en");
    expect(element.querySelector("header nav a")?.textContent).toContain("Inbox");
  });

  it("opens the palette from its button, with global and per-change commands (AC8, AC3)", async () => {
    const { element, settle } = await open("/catalog");
    element.querySelector<HTMLButtonElement>("header sp-button button")?.click();
    await settle();
    const labels = [...document.querySelectorAll("[role=option]")].map((option) =>
      option.textContent?.trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Ir a la Bandeja",
        "Tema oscuro",
        "Abrir: Login con Google",
        "Catálogo: Colores",
      ]),
    );
  });

  it("scrolls only the content below the header, back to the top on each page (AC8)", async () => {
    const { element, router, settle } = await open("/catalog/colors");
    const frame = element.querySelector("sp-root > div, :scope > div");
    expect(frame?.className).toContain("h-dvh");
    expect(frame?.className).toContain("overflow-hidden");
    const content = element.querySelector<HTMLElement>("main");
    expect(content?.className).toContain("overflow-y-auto");
    if (content === null) return;
    content.scrollTop = 300;
    await router.navigateByUrl("/catalog/typography");
    await settle();
    expect(content.scrollTop).toBe(0);
    expect(document.activeElement).toBe(content);
  });

  it("goes back with Backspace, or to the Inbox when entering directly (AC8)", async () => {
    const { router, settle } = await open("/catalog/colors");
    const back = () =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
      );
    back();
    await settle();
    expect(router.url).toBe("/");
    await router.navigateByUrl("/catalog/typography");
    await settle();
    const historyBack = vi
      .spyOn(TestBed.inject(Location), "back")
      .mockImplementation(() => undefined);
    back();
    expect(historyBack).toHaveBeenCalled();
    historyBack.mockRestore();
  });

  it("does not go back while typing or with a dialog open (AC8)", async () => {
    const { element, router, settle } = await open("/catalog/overlays");
    element.querySelector<HTMLButtonElement>("#open-dialog button")?.click();
    await settle();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    await settle();
    expect(router.url).toBe("/catalog/overlays");
    const field = document.querySelector<HTMLTextAreaElement>("[role=dialog] textarea");
    field?.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    await settle();
    expect(router.url).toBe("/catalog/overlays");
  });

  it("sends unknown paths to the Inbox", async () => {
    const { router } = await open("/nowhere");
    expect(router.url).toBe("/");
  });
});
