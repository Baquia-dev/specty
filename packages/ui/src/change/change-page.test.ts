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
import { SHOW_EFFORT_HINT } from "./change-page";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecordForTest[]) => Promise.resolve(deriveViews(records)),
};

async function open(url: string, effortHint = false) {
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
      { provide: SHOW_EFFORT_HINT, useValue: effortHint },
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
    expect(facts).toEqual([
      "Revisión: Revisión 2 · por aprobar",
      "Rama: specty/20261020-evolucion-trimestre",
      expect.stringMatching(/^Tamaño: \S+ · .*3 archivos/),
      "Por decidir: 1 supuesto de alto impacto",
    ]);
    expect(element.querySelector("sp-change-page [role=tablist]")).not.toBeNull();
  });

  it("fits a phone: smaller title, no dangling dot, facts in a grid until they fit a row (AC1, AC2)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    const hero = element.querySelector<HTMLElement>("sp-change-page [data-hero]");
    const classes = (selector: string) => hero?.querySelector(selector)?.className.split(" ") ?? [];
    expect(classes("h1")).toEqual(expect.arrayContaining(["text-[1.75rem]", "sm:text-[2.375rem]"]));
    expect(classes("[data-since]")).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]));
    expect(classes("[data-waiting] + span")).toEqual(
      expect.arrayContaining(["hidden", "sm:inline"]),
    );
    // Wrapped under the title, the decision starts at the title's edge.
    expect(classes("sp-review-actions")).toContain("max-lg:items-start");
    // Two or three columns with no vertical lines; from lg, one row sized by its content.
    expect(classes("dl")).toEqual(
      expect.arrayContaining(["grid-cols-2", "sm:grid-cols-3", "lg:flex"]),
    );
    const fact = classes("dl > div");
    expect(fact).not.toContain("border-l");
    expect(fact).toEqual(
      expect.arrayContaining(["lg:border-l", "lg:first:border-l-0", "lg:flex-none"]),
    );
  });

  it("names the revision with its state and the approved one; the branch is never cut (AC1, AC2, AC3)", async () => {
    const { element } = await open("/changes/20261016-justificar-faltas");
    const hero = element.querySelector<HTMLElement>("sp-change-page [data-hero]");
    const revision = hero?.querySelector("[data-revision] dd");
    expect(text(revision?.querySelector("span"))).toBe("Revisión 3 · por aprobar");
    expect(text(revision?.querySelector("[data-approved]"))).toMatch(
      /^La 2 está aprobada · .+ · Ana Gómez$/,
    );
    // The only fact that gives way, breaking over lines; a whole row at the end when narrow.
    const branch = hero?.querySelector<HTMLElement>("[data-branch]");
    expect(branch?.className.split(" ")).toEqual(
      expect.arrayContaining(["col-span-full", "max-lg:order-last", "lg:flex-[0_1_auto]"]),
    );
    const name = branch?.querySelector("dd");
    expect(name?.className).toContain("wrap-anywhere");
    expect(name?.className).not.toContain("truncate");
  });

  it("hides the effort suggestion for now, and shows nothing in its place", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    const hero = element.querySelector<HTMLElement>("sp-change-page [data-hero]");
    expect(hero?.querySelector("[data-effort]")).toBeNull();
    expect(hero?.querySelector("sp-review-actions")).not.toBeNull();
    TestBed.resetTestingModule();
    const draft = await open("/changes/20261021-modo-oscuro");
    const column = draft.element.querySelector("sp-change-page [data-hero] h1")?.parentElement;
    expect(column?.nextElementSibling).toBeNull();
  });

  it("when shown, suggests the effort beside the decision; in a draft, to plan (AC4)", async () => {
    const effort = async (id: string) => {
      const { element } = await open(`/changes/${id}`, true);
      const hero = element.querySelector<HTMLElement>("sp-change-page [data-hero]");
      expect(hero?.querySelector("dl [data-effort]")).toBeNull();
      const hint = hero?.querySelector("[data-effort]");
      expect(hint?.querySelector("svg")).not.toBeNull();
      return { hint: text(hint), column: hint?.parentElement };
    };
    const review = await effort("20261020-evolucion-trimestre");
    expect(review.hint).toMatch(
      /^Sugerencia para el agente: implementar con esfuerzo \S+ y revisar con \S+\.$/,
    );
    expect(review.column?.querySelector("sp-review-actions")).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await effort("20261021-modo-oscuro")).hint).toMatch(
      /^Sugerencia para el agente: planificar con esfuerzo \S+ e implementar con \S+\.$/,
    );
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
      expect(text(bar()?.querySelector("[data-revision]"))).toBe("Revisión 2 · por aprobar");
      // Title, revision and section grow together and only the title is cut: one line for all.
      const heading = bar()?.querySelector<HTMLElement>("[data-heading]");
      expect(heading?.className.split(" ")).toContain("flex-1");
      expect(heading?.querySelector("p")?.className).toContain("truncate");
      expect(heading?.querySelector("[data-revision]")?.className).toContain("shrink-0");
      expect(bar()?.querySelector("[data-revision] span")?.className).toContain("hidden sm:inline");
      expect(text(bar()?.querySelector("[data-reading]"))).toBe("§ 04 Criterios");
      // Only the decision on the right: no summary of assumptions and comments.
      expect(bar()?.querySelector("[data-summary]")).toBeNull();
      expect(text(bar())).not.toContain("Comentarios");
      // The decision comes along, compact: small buttons, the reason only in their tooltip.
      const actions = bar()?.querySelector<HTMLElement>("sp-review-actions");
      expect(actions?.hasAttribute("data-compact")).toBe(true);
      expect([...(actions?.querySelectorAll("sp-button button") ?? [])].map(text)).toEqual([
        "Pedir cambios",
        "Aprobar revisión 2",
      ]);
      expect(actions?.querySelector("[data-blocked]")).toBeNull();
      expect(bar()?.querySelector("h1")).toBeNull();

      trigger("[data-hero]", true);
      await settle();
      expect(bar()?.hasAttribute("inert")).toBe(true);
    } finally {
      Reflect.deleteProperty(window, "IntersectionObserver");
    }
  });

  it("puts the decision on the spec next to the title, with no bar at the foot (AC1)", async () => {
    const { element } = await open("/changes/20261020-evolucion-trimestre");
    const actions = element.querySelector("sp-change-page [data-hero] sp-review-actions");
    expect([...(actions?.querySelectorAll("sp-button button") ?? [])].map(text)).toEqual([
      "Pedir cambios",
      "Aprobar revisión 2",
    ]);
    expect(text(actions?.querySelector("[data-blocked]"))).toBe(
      "Falta 1 supuesto de alto impacto por decidir.",
    );
    // Two places at most: the header and the compact bar, and nothing fixed below.
    expect(element.querySelectorAll("sp-review-actions")).toHaveLength(2);
    expect(element.querySelector("sp-spec-review sp-review-actions")).toBeNull();
  });

  it("offers no decision on the spec outside review (AC3)", async () => {
    const { element } = await open("/changes/20261021-login-google?tab=spec");
    expect(element.querySelector("sp-review-actions")).toBeNull();
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

  it("shows the tasks in the Progress tab and updates the open change live (AC5)", async () => {
    const { element, fixtures, settle } = await open("/changes/20261019-boletines-pdf");
    // The real tab, with the task waiting for a decision on top.
    const tab = element.querySelector("[role=tabpanel]:not([hidden]) sp-progress-tab");
    expect(tab?.querySelectorAll("sp-task-row")).toHaveLength(3);
    expect(text(tab?.querySelector("[data-waiting] [data-scope-request]"))).toContain("T3 pide");
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
