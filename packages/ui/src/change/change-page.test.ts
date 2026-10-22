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

  it("opens with a wide header: way back, phase and wait, big title, facts and tabs (AC3)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    const hero = element.querySelector<HTMLElement>("sp-change-page [data-hero]");
    expect(hero?.querySelector("a")?.getAttribute("href")).toBe("/");
    expect(text(hero?.querySelector("a"))).toBe("Bandeja");
    expect(text(hero?.querySelector("p .font-mono"))).toBe("20261020-evolucion-trimestre");
    expect(hero?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("review");
    expect(text(hero?.querySelector("[data-waiting]"))).toBe("Espera tu revisión de la spec");
    expect(text(hero?.querySelector("[data-since]"))).toMatch(/^hace /);
    expect(text(hero?.querySelector("h1"))).toBe("Agrupar la evolución académica por trimestre");
    const facts = [...(hero?.querySelectorAll("dl > div") ?? [])].map(
      (fact) => `${text(fact.querySelector("dt"))}: ${text(fact.querySelector("dd"))}`,
    );
    expect(facts[0]).toBe("Revisión: r2");
    expect(facts[1]).toBe("Rama: specty/20261020-evolucion-trimestre");
    expect(facts[2]).toMatch(/^Tamaño: \S+ · .*3 archivos/);
    expect(facts[3]).toMatch(/^Esfuerzo recomendado: Planificación \S+ · Implementación \S+$/);
    expect(facts[4]).toBe("Por decidir: 1 supuesto de alto impacto");
    expect(element.querySelector("sp-change-page [role=tablist]")).not.toBeNull();
  });

  it("slides in a compact bar, without actions, once the wide header leaves the view (AC4)", async () => {
    const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
    class FakeObserver {
      readonly targets: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, targets: this.targets });
      }
      observe(target: Element): void {
        this.targets.push(target);
      }
      disconnect(): void {}
    }
    Object.assign(window, { IntersectionObserver: FakeObserver });
    try {
      const { element, settle } = await open("/changes/20261020-evolucion-trimestre");
      const bar = () => element.querySelector<HTMLElement>("sp-change-page [data-sticky]");
      const trigger = (target: string, isIntersecting: boolean) => {
        for (const { callback, targets } of observers) {
          const found = targets.find((candidate) => candidate.matches(target));
          if (found === undefined) continue;
          const entry = { target: found, isIntersecting } as IntersectionObserverEntry;
          callback([entry], {} as IntersectionObserver);
        }
      };
      // At the top, the bar is out of sight and out of reach.
      expect(bar()?.hasAttribute("inert")).toBe(true);
      expect(bar()?.className).toContain("opacity-0");
      expect(bar()?.className).toContain("motion-reduce:transition-none");

      trigger("[data-hero]", false);
      // The section being read comes from the review: pick "Criterios" in its index.
      Element.prototype.scrollIntoView = () => undefined;
      [...element.querySelectorAll<HTMLButtonElement>("sp-spec-review nav button")]
        .find((button) => text(button).includes("Criterios"))
        ?.click();
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
      await settle();
      expect(bar()?.hasAttribute("inert")).toBe(false);
      expect(bar()?.className).toContain("opacity-100");
      expect(bar()?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("review");
      expect(text(bar()?.querySelector("p"))).toBe("Agrupar la evolución académica por trimestre");
      expect(text(bar()?.querySelector("p + span"))).toBe("r2");
      expect(text(bar()?.querySelector("[data-reading]"))).toBe("§ 04 Criterios");
      expect(text(bar()?.querySelector("[data-summary]"))).toBe("Supuestos 1/2 · Comentarios 2");
      expect(bar()?.querySelector("button")).toBeNull();
      expect(bar()?.querySelector("h1")).toBeNull();

      trigger("[data-hero]", true);
      await settle();
      expect(bar()?.hasAttribute("inert")).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "IntersectionObserver");
    }
  });

  it("leaves the room below the content to the shell, like every page (AC2)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    expect(element.querySelector("main")?.className.split(" ")).toContain("pb-16");
    const page = element.querySelector("sp-change-page > div");
    expect(page).not.toBeNull();
    expect(page?.className).not.toMatch(/\b(pb|py)-\d/);
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
    const hero = element.querySelector("sp-change-page [data-hero]");
    expect(hero?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("acceptance");
    expect(text(hero?.querySelector("[data-waiting]"))).toBe("Espera que aceptes el resultado");
    const bar = element.querySelector("sp-change-page [data-sticky]");
    expect(bar?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("acceptance");
  });
});
