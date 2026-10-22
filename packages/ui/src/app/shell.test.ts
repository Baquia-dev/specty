// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { FixtureData } from "../data/fixtures";
import { SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";
import { APP_ROUTES } from "./routes";
import { Shell } from "./shell";

async function open(path: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter(APP_ROUTES), { provide: SpectyData, useClass: FixtureData }],
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

  it("sends unknown paths to the Inbox", async () => {
    const { router } = await open("/nowhere");
    expect(router.url).toBe("/");
  });
});
