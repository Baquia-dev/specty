// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { FixtureData } from "../data/fixtures";
import { SpectyData } from "../data/records";
import { Preferences } from "../theme/preferences";

const press = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));

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
  await TestBed.inject(Router).navigateByUrl(path);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  };
  return { fixture, element, settle };
}

describe("Overlays page and catalog commands", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows each piece in use (AC9)", async () => {
    const { element } = await open("/catalog/overlays");
    expect(element.querySelector("h1")?.textContent).toContain("Superposiciones y teclado");
    for (const selector of ["sp-menu", "sp-tabs", "sp-collapsible", "sp-toaster", "sp-kbd"]) {
      expect(element.querySelector(selector), selector).not.toBeNull();
    }
  });

  it("moves the selection with j and k (AC9)", async () => {
    const { element, settle } = await open("/catalog/overlays");
    const selected = () =>
      [...element.querySelectorAll("sp-card")].findIndex((card) =>
        card.hasAttribute("aria-current"),
      );
    expect(selected()).toBe(0);
    press("j");
    press("j");
    await settle();
    expect(selected()).toBe(2);
    press("k");
    press("k");
    press("k");
    await settle();
    expect(selected()).toBe(0);
  });

  it("opens the dialog and shows toasts from the page (AC9)", async () => {
    const { element, settle } = await open("/catalog/overlays");
    element.querySelector<HTMLButtonElement>("#open-dialog button")?.click();
    await settle();
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(
      "Rechazar el supuesto A2",
    );
    const reject = [
      ...document.querySelectorAll<HTMLButtonElement>("[role=dialog] sp-button button"),
    ].at(-1);
    expect(reject?.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>("[role=dialog] sp-button button")?.click();
    await settle();
    expect(document.querySelector("[role=dialog]")).toBeNull();

    [...element.querySelectorAll<HTMLButtonElement>("sp-button[size=sm] button")].at(-1)?.click();
    await settle();
    expect(element.querySelector("[aria-live=assertive]")?.textContent).toContain("Aviso de error");
  });

  it("offers navigation, theme and language in the palette everywhere (AC9)", async () => {
    const { settle } = await open("/catalog/colors");
    press("k", { ctrlKey: true });
    await settle();
    const labels = [...document.querySelectorAll("[role=option]")].map((option) =>
      option.textContent?.trim(),
    );
    expect(labels).toEqual(
      expect.arrayContaining(["Catálogo: Componentes", "Tema oscuro", "Idioma: inglés"]),
    );
    const english = [...document.querySelectorAll<HTMLElement>("[role=option]")].find(
      (option) => option.textContent?.trim() === "Idioma: inglés",
    );
    english?.click();
    await settle();
    expect(TestBed.inject(Preferences).lang()).toBe("en");
  });
});
