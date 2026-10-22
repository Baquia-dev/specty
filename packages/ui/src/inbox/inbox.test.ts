// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import type { ChangeRecord as ChangeRecordForTest } from "../data/records";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

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
  await router.navigateByUrl("/");
  await settle();
  const fixtures = TestBed.inject(SpectyData) as FixtureData;
  const cards = () => [...element.querySelectorAll<HTMLElement>("sp-inbox sp-card")];
  const press = (key: string) =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  return { fixture, element, router, settle, fixtures, cards, press };
}

const text = (element: Element | undefined) => element?.textContent?.replace(/\s+/g, " ") ?? "";

describe("Inbox while loading", () => {
  it("shows skeletons with the final shape, announced once (AC6)", async () => {
    class Pending extends SpectyData {
      changes(): Promise<readonly ChangeRecord[]> {
        return new Promise(() => undefined);
      }
      subscribe(): () => void {
        return () => undefined;
      }
    }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: Pending },
        IN_THREAD,
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await TestBed.inject(Router).navigateByUrl("/");
    // The source never answers, so the app never becomes stable: advance by hand.
    for (let round = 0; round < 20; round++) {
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll("sp-inbox sp-skeleton")).toHaveLength(3);
    expect(element.querySelectorAll("sp-inbox [role=status]")).toHaveLength(1);
    TestBed.resetTestingModule();
  });
});

describe("Inbox", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows skeletons first, then decisions, work in progress and recent changes (AC1, AC6)", async () => {
    const { element } = await open();
    const headings = [...element.querySelectorAll("sp-inbox h2")].map((heading) =>
      text(heading).trim(),
    );
    expect(headings).toEqual(["Esperan tu decisión 4", "En curso", "Recientes"]);
    const decisions = [...element.querySelectorAll("section[aria-labelledby=decisions] sp-card")];
    expect(
      decisions.map((card) => text(card.querySelector("[data-decision]") ?? undefined)),
    ).toEqual([
      "Resultado por aceptar",
      "Cierre por confirmar",
      "Spec por revisar",
      "Solicitud de alcance",
    ]);
    const first = decisions[0];
    expect(first?.querySelector("sp-phase-badge")).not.toBeNull();
    expect(text(first)).toMatch(/hace 1 h|hace 95 min|hace 2 h/);
    expect(first?.querySelector("sp-badge")).not.toBeNull();
    expect(first?.querySelector("sp-button")).not.toBeNull();
    expect(text(element.querySelector("section[aria-labelledby=recent]") ?? undefined)).toContain(
      "Corregir el redondeo de promedios",
    );
  });

  it("tells how many high-impact assumptions wait, and what scope is asked (AC2)", async () => {
    const { cards } = await open();
    const review = cards().find((card) => card.dataset.id === "20261020-evolucion-trimestre");
    expect(text(review)).toContain("1 supuesto de alto impacto por confirmar");
    const scope = cards().find((card) => card.dataset.id === "20261019-boletines-pdf");
    expect(text(scope)).toContain("T3 pide lib/shared/pdf/layout.dart");
    expect(text(scope)).toContain("«La firma necesita el maquetador compartido.»");
  });

  it("moves with j/k, focusing the change so Enter opens it (AC3)", async () => {
    const { fixture, cards, press } = await open();
    expect(cards()[0]?.getAttribute("aria-current")).toBe("true");
    press("j");
    press("j");
    await fixture.whenStable();
    expect(cards()[2]?.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(cards()[2]?.querySelector("a"));
    for (let step = 0; step < 10; step++) press("j");
    await fixture.whenStable();
    expect(cards().at(-1)?.getAttribute("aria-current")).toBe("true");
    press("k");
    await fixture.whenStable();
    expect(cards().at(-2)?.getAttribute("aria-current")).toBe("true");
  });

  it("opens a change on the tab its decision needs (AC1)", async () => {
    const { cards, router, settle } = await open();
    const scope = cards().find((card) => card.dataset.id === "20261019-boletines-pdf");
    scope?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(router.url).toBe("/changes/20261019-boletines-pdf?tab=progress");
  });

  it("updates live and explains a failing source, with retry (AC5, AC6)", async () => {
    const { element, fixtures, settle, cards } = await open();
    fixtures.approveSpec();
    await settle();
    expect(
      cards().some(
        (card) =>
          card.dataset.id === "20261020-evolucion-trimestre" &&
          text(card).includes("Spec por revisar"),
      ),
    ).toBe(false);
    fixtures.toggleOutage();
    await settle();
    const alert = element.querySelector("sp-inbox [role=alert]");
    expect(text(alert ?? undefined)).toContain("No se pudieron leer los cambios");
    fixtures.toggleOutage();
    alert?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(element.querySelector("sp-inbox [role=alert]")).toBeNull();
  });
});
