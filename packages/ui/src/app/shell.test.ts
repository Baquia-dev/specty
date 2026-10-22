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
