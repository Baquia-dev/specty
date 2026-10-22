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
  const rows = () => [...element.querySelectorAll<HTMLElement>("sp-inbox sp-inbox-row")];
  const row = (id: string) => rows().find((item) => item.dataset.id === id);
  const sections = () =>
    [...element.querySelectorAll<HTMLElement>("sp-inbox section")].map(
      (section) =>
        `${text(section.querySelector("h2"))} ${text(section.querySelector("[data-meta]"))}`,
    );
  const search = () => element.querySelector<HTMLInputElement>("sp-inbox-toolbar input");
  const press = (key: string) =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const typeIn = async (value: string) => {
    const input = search();
    if (input === null) throw new Error("no search");
    input.value = value;
    input.dispatchEvent(new Event("input"));
    await settle();
  };
  return { fixture, element, router, settle, fixtures, rows, row, sections, search, press, typeIn };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const short = (id: string | undefined) => id?.replace(/^\d+-/, "");

describe("Inbox while loading", () => {
  it("shows skeletons with the final shape, announced once", async () => {
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

  it("shows every change as a document row, by state and longest wait first (AC1)", async () => {
    const { element, rows, row, sections } = await open();
    expect(text(element.querySelector("sp-inbox h1"))).toBe("Bandeja");
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "5 decisiones · 2 en curso · 2 recientes",
    );
    expect(sections()).toEqual(["Esperan tu decisión 5", "En curso 2", "Recientes 2"]);
    expect(rows().map((item) => short(item.dataset.id))).toEqual([
      "asistencia-curso",
      "recordatorios-correo",
      "justificar-faltas",
      "evolucion-trimestre",
      "boletines-pdf",
      "login-google",
      "modo-oscuro",
      "chat-docentes",
      "redondeo-promedios",
    ]);
    // No cards: rows under a divider, indented, lighting up on hover.
    expect(element.querySelector("sp-inbox sp-card")).toBeNull();
    expect(element.querySelector("sp-inbox [role=list]")?.className).toContain("pl-6");
    const first = rows()[0];
    expect(first?.getAttribute("aria-current")).toBe("true");
    expect(first?.className).toContain("hover:bg-text/4");
    expect(first?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("acceptance");
    expect(text(first?.querySelector("[data-waits]"))).toMatch(/^Resultado por aceptar · S/);
    // How long goes under the phase, apart from the action.
    const since = first?.querySelector("[data-since]");
    expect(since?.parentElement?.querySelector("sp-phase-badge")).not.toBeNull();
    expect(since?.parentElement?.querySelector("sp-button")).toBeNull();
    expect(text(first?.querySelector("sp-button"))).toBe("Revisar resultado");
    expect(first?.querySelector("sp-button button")?.className).toContain("bg-accent");
    expect(text(row("20261016-justificar-faltas")?.querySelector("[data-waits]"))).toContain(
      "Spec por revisar · revisión 3, frente a la 2 aprobada",
    );
    expect(text(row("20261020-evolucion-trimestre")?.querySelector("[data-waits]"))).toMatch(
      /^Spec por revisar · revisión 2 · /,
    );
    expect(text(row("20261020-evolucion-trimestre")?.querySelector("[data-note]"))).toBe(
      "1 supuesto de alto impacto por confirmar",
    );
    expect(text(row("20261019-boletines-pdf")?.querySelector("[data-note]"))).toBe(
      "T3 pide lib/shared/pdf/layout.dart: «La firma necesita el maquetador compartido.»",
    );
    expect(text(row("20261021-login-google")?.querySelector("[data-progress]"))).toBe(
      "1 de 2 tareas",
    );
    expect(row("20261021-login-google")?.querySelector("sp-button")).toBeNull();
  });

  it("moves with j/k, focusing the change so Enter opens it (AC1)", async () => {
    const { fixture, rows, press } = await open();
    press("j");
    press("j");
    await fixture.whenStable();
    expect(rows()[2]?.getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(rows()[2]?.querySelector("a"));
    for (let step = 0; step < 12; step++) press("j");
    await fixture.whenStable();
    expect(rows().at(-1)?.getAttribute("aria-current")).toBe("true");
    press("k");
    await fixture.whenStable();
    expect(rows().at(-2)?.getAttribute("aria-current")).toBe("true");
  });

  it("finds by title or id, ignoring case and accents; / to search and Escape to clear (AC2)", async () => {
    const { fixture, rows, search, press, typeIn } = await open();
    press("/");
    await fixture.whenStable();
    expect(document.activeElement).toBe(search());
    await typeIn("EVOLUCION");
    expect(rows().map((item) => short(item.dataset.id))).toEqual(["evolucion-trimestre"]);
    search()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await fixture.whenStable();
    expect(search()?.value).toBe("");
    expect(rows()).toHaveLength(9);
  });

  it("keeps the view when coming back from a change, with a clean URL (AC6)", async () => {
    const { element, router, rows, settle, search, typeIn } = await open();
    await typeIn("pdf");
    element.querySelector<HTMLButtonElement>("[data-group] button:nth-child(2)")?.click();
    await settle();
    expect(router.url).toBe("/");
    rows()[0]?.querySelector<HTMLAnchorElement>("a")?.click();
    await settle();
    expect(router.url).toBe("/changes/20261019-boletines-pdf?tab=progress");
    await router.navigateByUrl("/");
    await settle();
    expect(router.url).toBe("/");
    expect(search()?.value).toBe("pdf");
    expect(rows().map((item) => short(item.dataset.id))).toEqual(["boletines-pdf"]);
    expect(
      element.querySelector("[data-group] button[aria-pressed=true]")?.textContent?.trim(),
    ).toBe("Fase");
    expect(localStorage.getItem("specty.inbox.group")).toBe("phase");
  });

  it("opens a change on the tab its decision needs", async () => {
    const { row, router, settle } = await open();
    row("20261019-boletines-pdf")?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(router.url).toBe("/changes/20261019-boletines-pdf?tab=progress");
  });

  it("updates live and explains a failing source, with retry", async () => {
    const { element, fixtures, settle, row } = await open();
    fixtures.approveSpec();
    await settle();
    expect(
      row("20261020-evolucion-trimestre")
        ?.querySelector("sp-phase-badge")
        ?.getAttribute("data-phase"),
    ).toBe("implementing");
    fixtures.toggleOutage();
    await settle();
    const alert = element.querySelector("sp-inbox [role=alert]");
    expect(text(alert)).toContain("No se pudieron leer los cambios");
    fixtures.toggleOutage();
    alert?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(element.querySelector("sp-inbox [role=alert]")).toBeNull();
  });
});
