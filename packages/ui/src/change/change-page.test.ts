// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import type { ChangeRecord as ChangeRecordForTest } from "../data/records";
import { SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

async function open(url: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: FixtureData },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const router = TestBed.inject(Router);
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await router.navigateByUrl(url);
  await settle();
  const selectedTab = () =>
    element.querySelector("sp-change-page [role=tab][aria-selected=true]")?.textContent?.trim();
  return {
    fixture,
    element,
    router,
    settle,
    selectedTab,
    fixtures: TestBed.inject(SpectyData) as FixtureData,
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows title, phase, revision, branch, size with reasons and effort (AC4)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    // Title and state stay in view (sticky); branch, size and effort scroll with the page.
    const sticky = element.querySelector<HTMLElement>("sp-change-page [data-sticky]");
    expect(sticky?.className).toContain("sticky");
    expect(text(sticky?.querySelector("h1"))).toBe("Agrupar la evolución académica por trimestre");
    expect(sticky?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("review");
    expect(text(sticky)).toContain("r2");
    expect(text(sticky?.querySelector("[data-waiting]"))).toBe("Espera tu revisión de la spec");
    const header = element.querySelector("sp-change-page header");
    expect(text(header)).toContain("specty/20261020-evolucion-trimestre");
    expect(text(header)).toContain("3 archivos");
    expect(text(header)).toMatch(/Esfuerzo recomendado: planificación \S+ · implementación \S+/);
  });

  it("ends the page with room below the content (AC1)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    expect(element.querySelector("sp-change-page > div")?.className).toContain("pb-16");
  });

  it.each([
    ["20261020-evolucion-trimestre", "Spec"],
    ["20261021-login-google", "Progreso"],
    ["20261018-asistencia-curso", "Aceptación"],
    ["20261017-recordatorios-correo", "Aceptación"],
    ["20261015-redondeo-promedios", "Historial"],
    ["20261021-modo-oscuro", "Spec"],
  ])("opens %s on the tab of its phase (AC4)", async (id, tab) => {
    const { selectedTab } = await open(`/changes/${id}`);
    expect(selectedTab()).toBe(tab);
  });

  it("follows ?tab= and writes it back when the tab changes (AC4)", async () => {
    const { element, router, settle, selectedTab } = await open(
      "/changes/20261021-login-google?tab=history",
    );
    expect(selectedTab()).toBe("Historial");
    [...element.querySelectorAll<HTMLButtonElement>("[role=tab]")][0]?.click();
    await settle();
    expect(selectedTab()).toBe("Spec");
    expect(router.url).toBe("/changes/20261021-login-google?tab=spec");
  });

  it("shows an empty state with the way back for an unknown id (AC4)", async () => {
    const { element } = await open("/changes/20990101-no-existe");
    const empty = element.querySelector("sp-change-page [role=status]");
    expect(text(empty)).toContain("No existe ese cambio");
    expect(empty?.querySelector("a")?.getAttribute("href")).toBe("/");
  });

  it("updates the open change live (AC5)", async () => {
    const { element, fixtures, settle } = await open("/changes/20261019-boletines-pdf");
    expect(text(element.querySelector("[role=tabpanel]:not([hidden])"))).toContain("S1 · T3 pide");
    fixtures.approveScope();
    fixtures.finishTask();
    await settle();
    const sticky = element.querySelector("sp-change-page [data-sticky]");
    expect(sticky?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("acceptance");
    expect(text(sticky?.querySelector("[data-waiting]"))).toBe("Espera que aceptes el resultado");
  });
});
