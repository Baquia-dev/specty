// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router } from "@angular/router";
import type { EpicLane } from "./epic-lanes";
import { InboxLane } from "./inbox-lane";

/** A page for the route the line links to. */
@Component({ template: "" })
class Page {}

/** C2, whose change waits for the person to approve its tests. */
const WAITING: EpicLane = {
  key: "C2",
  slice: "C2",
  title: "Avisos de calificaciones",
  change: { id: "20261022-avisos-calificaciones", tab: "progress" },
  state: { kind: "open", phase: "testing", decision: "tests" },
};

@Component({
  imports: [InboxLane],
  template: `<div class="grid grid-cols-4"><sp-inbox-lane [lane]="lane()" [current]="current()" /></div>`,
})
class Host {
  readonly lane = signal<EpicLane>(WAITING);
  readonly current = signal(false);
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: "changes/:id", component: Page }])],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const lane = () => element.querySelector<HTMLElement>("sp-inbox-lane");
  const cells = () =>
    [...element.querySelectorAll<HTMLElement>("[data-track] [data-cell]")].map(
      (cell) => cell.dataset.cell,
    );
  const show = async (given: EpicLane) => {
    fixture.componentInstance.lane.set(given);
    await fixture.whenStable();
  };
  return { fixture, element, lane, cells, show, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("InboxLane", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: shows the slice's id, its title linked to its change and its four stretches", async () => {
    const { lane, cells, show } = await render();
    await show({
      ...WAITING,
      key: "C3",
      slice: "C3",
      title: "Acceso con Google",
      change: { id: "20261021-login-google", tab: "progress" },
      state: { kind: "open", phase: "implementing" },
    });
    expect(lane()?.dataset.slice).toBe("C3");
    expect(lane()?.dataset.id).toBe("20261021-login-google");
    expect(lane()?.dataset.state).toBe("open");
    expect(text(lane()?.querySelector("[data-slice-id]"))).toBe("C3");
    const link = lane()?.querySelector<HTMLAnchorElement>("a");
    expect(text(link)).toBe("Acceso con Google");
    expect(link?.getAttribute("href")).toBe("/changes/20261021-login-google?tab=progress");
    // The stretches passed, filled; its phase's, in the phase's color; the rest, empty.
    expect(cells()).toEqual(["past", "past", "current", "empty"]);
    const current = lane()?.querySelector<HTMLElement>('[data-cell="current"]');
    expect(current?.style.background).toContain("--color-phase-implementing");
    expect(lane()?.querySelector("[data-planned]")).toBeNull();
    expect(lane()?.querySelector("sp-button")).toBeNull();
  });

  it("AC2: draws a finished slice's four stretches in green, as a line like the others", async () => {
    const { lane, cells, show } = await render();
    await show({
      key: "C1",
      slice: "C1",
      title: "Asistencia por curso",
      change: { id: "20261001-asistencia-archivada" },
      state: { kind: "done" },
    });
    expect(cells()).toEqual(["done", "done", "done", "done"]);
    for (const cell of lane()?.querySelectorAll<HTMLElement>("[data-cell]") ?? []) {
      expect(cell.style.background).toContain("--color-phase-done");
    }
    expect(lane()?.querySelector("a")?.getAttribute("href")).toBe(
      "/changes/20261001-asistencia-archivada",
    );
    expect(text(lane()?.querySelector("[data-slice-id]"))).toBe("C1");
  });

  it("AC2: leaves a slice without state with an empty track, no text and no link", async () => {
    const { lane, cells, show } = await render();
    await show({
      key: "C4",
      slice: "C4",
      title: "Chat entre docentes",
      state: { kind: "unknown" },
    });
    expect(lane()?.dataset.state).toBe("unknown");
    expect(cells()).toEqual(["empty", "empty", "empty", "empty"]);
    expect(lane()?.querySelector("a")).toBeNull();
    expect(lane()?.querySelector("[data-planned]")).toBeNull();
    expect(lane()?.hasAttribute("data-id")).toBe(false);
    expect(text(lane()?.querySelector("[data-title]"))).toBe("Chat entre docentes");
  });

  it("AC3: says, in place of the track, that a slice is ready or what it waits for", async () => {
    const { lane, show } = await render();
    const planned = async (waitsFor: readonly string[], beforeApproval: boolean) => {
      await show({
        key: "C4",
        slice: "C4",
        title: "Chat entre docentes",
        state: { kind: "planned", waitsFor, beforeApproval },
      });
      expect(lane()?.querySelector("[data-track]")).toBeNull();
      expect(lane()?.querySelector("a")).toBeNull();
      return text(lane()?.querySelector("[data-planned]"));
    };
    expect(await planned([], false)).toBe("Listo para empezar");
    expect(await planned(["C1"], false)).toBe("Espera a C1");
    expect(await planned(["C2", "C3"], false)).toBe("Espera a C2 y C3");
    expect(await planned([], true)).toBe("Puede arrancar en cuanto apruebes");
    expect(await planned(["C1"], true)).toBe("Tras C1");
    expect(await planned(["C1", "C2", "C3"], true)).toBe("Tras C1, C2 y C3");
  });

  it("AC3: says it in English too", async () => {
    const { lane, show } = await render("en");
    const planned = async (waitsFor: readonly string[], beforeApproval: boolean) => {
      await show({
        key: "C4",
        slice: "C4",
        title: "Chat",
        state: { kind: "planned", waitsFor, beforeApproval },
      });
      return text(lane()?.querySelector("[data-planned]"));
    };
    expect(await planned([], false)).toBe("Ready to start");
    expect(await planned(["C2", "C3"], false)).toBe("Waits for C2 and C3");
    expect(await planned([], true)).toBe("Can start once you approve");
    expect(await planned(["C1"], true)).toBe("After C1");
  });

  it("AC4: puts on the right the button of the decision it waits for, which opens its page, and marks its stretch", async () => {
    const { fixture, lane, cells } = await render();
    expect(cells()).toEqual(["past", "current", "empty", "empty"]);
    const marked = [...(lane()?.querySelectorAll<HTMLElement>("[data-cell]") ?? [])].map((cell) =>
      cell.hasAttribute("data-marked"),
    );
    expect(marked).toEqual([false, true, false, false]);
    expect(text(lane()?.querySelector("sp-button"))).toBe("Aprobar tests");
    lane()?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    expect(TestBed.inject(Router).url).toBe("/changes/20261022-avisos-calificaciones?tab=progress");
  });

  it("AC4: names each decision as the row does, and marks the line picked with j/k", async () => {
    const { fixture, lane, show, host } = await render();
    const labels: string[] = [];
    for (const [decision, phase] of [
      ["review", "review"],
      ["scope", "implementing"],
      ["acceptance", "acceptance"],
      ["closing", "closing"],
    ] as const) {
      await show({ ...WAITING, state: { kind: "open", phase, decision } });
      labels.push(text(lane()?.querySelector("sp-button")));
    }
    expect(labels).toEqual([
      "Revisar spec",
      "Decidir alcance",
      "Revisar resultado",
      "Revisar cierre",
    ]);
    expect(lane()?.hasAttribute("aria-current")).toBe(false);
    host.current.set(true);
    await fixture.whenStable();
    expect(lane()?.getAttribute("aria-current")).toBe("true");
  });
});
