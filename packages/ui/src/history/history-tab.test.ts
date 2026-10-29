// SPDX-License-Identifier: Apache-2.0
import { Component, input } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { TabPanel, Tabs } from "../components/tabs";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import type { HistoryEntry } from "../data/history";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { HistoryTab } from "./history-tab";

/** Five events over two days, by the person, the agent and Specty. */
const EVENTS: readonly HistoryEntry[] = [
  {
    at: "2026-10-27T09:15:00Z",
    actor: "human",
    event: "change.created",
    type: "spec",
    title: { es: "Cambio creado", en: "Change created" },
    details: [{ es: "Cambio rápido", en: "Quick change" }],
  },
  {
    at: "2026-10-27T09:40:00Z",
    actor: "agent",
    tool: "claude-code",
    event: "spec.proposed",
    type: "spec",
    title: { es: "Propuso la revisión 1", en: "Proposed revision 1" },
    details: [],
  },
  {
    at: "2026-10-28T12:05:00Z",
    actor: "agent",
    tool: "claude-code",
    event: "task.verified",
    type: "verifications",
    title: { es: "Verificación de T1: pasó", en: "T1's verification: passed" },
    details: [{ es: "pnpm test · 12 s", en: "pnpm test · 12 s" }],
  },
  {
    at: "2026-10-28T12:30:00Z",
    actor: "specty",
    event: "scope.decided",
    type: "scope",
    title: { es: "S1 aprobada por la política", en: "S1 approved by the policy" },
    details: [],
  },
  {
    at: "2026-10-28T13:00:00Z",
    actor: "human",
    event: "change.closed",
    type: "closing",
    title: { es: "Cambio cerrado", en: "Change closed" },
    details: [{ es: "Por delegación: lo decidió el agente", en: "Delegated: the agent decided" }],
  },
];

@Component({
  imports: [Tabs, TabPanel, HistoryTab],
  template: `
    <sp-tabs label="Cambio">
      <sp-tab-panel value="history" label="Historial">
        <sp-history-tab [history]="history()" />
      </sp-tab-panel>
    </sp-tabs>
  `,
})
class Host {
  readonly history = input<readonly HistoryEntry[]>(EVENTS);
}

async function render(history: readonly HistoryEntry[] = EVENTS) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  fixture.componentRef.setInput("history", history);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const rows = () => [...element.querySelectorAll<HTMLElement>("[data-event]")];
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { element, settle, rows, text };
}

describe("the History tab", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows the events in time order, by day, each with its time, who, type, title and details", async () => {
    const { element, rows, text } = await render();
    expect(element.querySelectorAll("[data-day]")).toHaveLength(2);
    expect(rows()).toHaveLength(5);
    expect(rows().map((row) => row.querySelector("time")?.getAttribute("datetime"))).toEqual(
      EVENTS.map((event) => event.at),
    );
    expect(text(rows()[0])).toContain("Persona");
    expect(text(rows()[0])).toContain("Cambio creado");
    expect(text(rows()[0])).toContain("Cambio rápido");
    expect(text(rows()[1])).toContain("Agente · Claude Code");
    expect(text(rows()[2])).toContain("Verificaciones");
    expect(text(rows()[2])).toContain("pnpm test · 12 s");
    expect(text(rows()[3])).toContain("Specty");
    expect(text(rows()[4])).toContain("Por delegación: lo decidió el agente");
    expect(text(element.querySelector("[data-summary]"))).toBe("5 eventos");
  });

  it("AC2: filters by who and by type, says how many of how many, and clears the filters", async () => {
    const { element, settle, rows, text } = await render();
    element.querySelector<HTMLInputElement>("input[type=radio][value=agent]")?.click();
    await settle();
    expect(rows()).toHaveLength(2);
    expect(text(element.querySelector("[data-summary]"))).toBe("2 de 5 eventos");

    element.querySelector<HTMLElement>("[role=combobox]")?.click();
    await settle();
    const verifications = [...document.querySelectorAll<HTMLElement>("[role=option]")].find(
      (option) => text(option) === "Verificaciones",
    );
    verifications?.click();
    await settle();
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0])).toContain("Verificación de T1: pasó");

    element.querySelector<HTMLInputElement>("input[type=radio][value=specty]")?.click();
    await settle();
    expect(rows()).toHaveLength(0);
    expect(text(element.querySelector("[data-no-match]"))).toContain(
      "Ningún evento coincide con estos filtros.",
    );
    element.querySelector<HTMLButtonElement>("[data-clear]")?.click();
    await settle();
    expect(rows()).toHaveLength(5);
  });

  it("AC3: says when the change has no events yet", async () => {
    const { element, rows, text } = await render([]);
    expect(rows()).toHaveLength(0);
    expect(text(element.querySelector("sp-empty-state"))).toContain("Aún no hay eventos");
  });

  it("AC1: is the History tab of a change's page, with its events", async () => {
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
        {
          provide: DERIVER,
          useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
        },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await TestBed.inject(Router).navigateByUrl("/changes/20261015-redondeo-promedios?tab=history");
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll("sp-history-tab [data-event]").length).toBeGreaterThanOrEqual(
      6,
    );
    expect(element.textContent).not.toContain("llegan en la fase 3");
  });

  it("AC5: shows who, type and the event count on the right of the tab bar once the top bar scrolls out of view", async () => {
    let observed: Element | undefined;
    let fire: IntersectionObserverCallback = () => undefined;
    class FakeObserver {
      constructor(callback: IntersectionObserverCallback) {
        fire = callback;
      }
      observe(target: Element): void {
        observed = target;
      }
      disconnect(): void {}
    }
    Object.assign(window, { IntersectionObserver: FakeObserver });
    try {
      const { element, settle, rows, text } = await render();
      const top = element.querySelector<HTMLElement>("sp-history-tab [data-top]");
      expect(observed).toBe(top);
      if (observed === undefined) throw new Error("expected observed target");
      expect(element.querySelector("[data-tabs-end]")).toBeNull();

      fire(
        [{ target: observed, isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await settle();
      const end = element.querySelector<HTMLElement>("[data-tabs-end]");
      expect(text(end?.querySelector("[data-compact-summary] p"))).toBe("5 eventos");
      end
        ?.querySelector<HTMLInputElement>("[data-compact-actor] input[type=radio][value=agent]")
        ?.click();
      await settle();
      expect(rows()).toHaveLength(2);
      expect(text(end?.querySelector("[data-compact-summary] p"))).toBe("2 de 5 eventos");
      expect(end?.querySelector("[data-compact-type]")).not.toBeNull();

      fire(
        [{ target: observed, isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
      await settle();
      expect(element.querySelector("[data-tabs-end]")).toBeNull();
    } finally {
      Reflect.deleteProperty(window, "IntersectionObserver");
    }
  });
});
