// SPDX-License-Identifier: Apache-2.0
// The titles of the «Panel» page's lists (docs/ui.md): «Los cambios más caros» and «Cambios con
// más verificaciones fallidas» show each change's title, linked to it, with its id below, and
// only its id when the source gives no title.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { StatsView } from "@baquia-dev/specty-core";
import { DashboardCost } from "./dashboard-cost";
import { DashboardQuality } from "./dashboard-quality";

type Cost = NonNullable<StatsView["cost"]>;
type Quality = NonNullable<StatsView["quality"]>;

const HOUR = 3_600_000;
const DAY = { from: "2026-11-07", to: "2026-11-07" };

/** A day with a cost: the costliest change has its title, the other one does not. */
const COST: Cost = {
  unit: "day",
  buckets: [{ ...DAY, cost: 43.75 }],
  tokens: { input: 10, output: 20, cacheWrite: 30, cacheRead: 40, calls: 5, changes: 2 },
  lanes: [
    { kind: "standard", cost: 41.5, changes: 1 },
    { kind: "quick", cost: 2.25, changes: 1 },
  ],
  top: [
    {
      id: "20261105-guard-y-alcance",
      title: "El guard respeta el alcance",
      kind: "standard",
      cost: 41.5,
      tasks: 6,
      cycle: 27 * HOUR,
      sessions: 3,
    },
    { id: "20261106-abierto", kind: "quick", cost: 2.25, tasks: 0, cycle: null, sessions: 0 },
  ],
};

/** A day with failed verifications: the change that failed the most has its title. */
const QUALITY: Quality = {
  unit: "day",
  buckets: [{ ...DAY, passed: 4, total: 8 }],
  full: { failed: 0, total: 1 },
  tests: { proposed: 0, locked: 0 },
  risks: 0,
  longFiles: 0,
  removedAssertions: 0,
  worst: [
    { id: "20261104-tabla", title: "La tabla se ordena", failed: 3, total: 5 },
    { id: "20261103-sin-titulo", failed: 1, total: 3 },
  ],
};

@Component({
  imports: [DashboardCost, DashboardQuality],
  template: `
    <sp-dashboard-quality [quality]="quality()" />
    <sp-dashboard-cost [cost]="cost()" [measured]="measured" />
  `,
})
class Host {
  readonly cost = signal(COST);
  readonly quality = signal(QUALITY);
  readonly measured = { measured: 2, of: 2 };
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element, fixture };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The cell of the change of a list's row: its link, the link's text and the id below. */
function changeCell(row: Element | null | undefined) {
  const cell = row?.querySelector("td");
  const links = [...(cell?.querySelectorAll("a") ?? [])];
  return {
    links: links.map((link) => [text(link), link.getAttribute("href")]),
    id: text(cell?.querySelector("[data-id]")),
    hasId: Boolean(cell?.querySelector("[data-id]")),
  };
}

describe("the titles of the «Panel» page's lists", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: each of the costliest changes shows its title linked to its change, with its id below; without a title, its id linked as before", async () => {
    const { element } = await render();
    const rows = [...element.querySelectorAll("[data-section='cost'] [data-top] tbody tr")];
    expect(rows.map((row) => row.getAttribute("data-change"))).toEqual([
      "20261105-guard-y-alcance",
      "20261106-abierto",
    ]);

    const titled = changeCell(rows[0]);
    expect(titled.links).toEqual([
      ["El guard respeta el alcance", "/changes/20261105-guard-y-alcance"],
    ]);
    expect(titled.id).toBe("20261105-guard-y-alcance");
    const id = rows[0]?.querySelector("[data-id]");
    expect(id?.className).toContain("font-mono");
    expect(id?.className).toContain("text-text-muted");
    // The id goes below the title, not inside its link.
    expect(id?.closest("a")).toBeNull();

    const plain = changeCell(rows[1]);
    expect(plain.links).toEqual([["20261106-abierto", "/changes/20261106-abierto"]]);
    expect(plain.hasId).toBe(false);
    expect(text(rows[1]?.querySelector("td"))).toBe("20261106-abierto");
  });

  it("AC2: each of the changes with most failed verifications shows its title linked to its change, with its id below; without a title, its id linked as before", async () => {
    const { element } = await render("en");
    const rows = [...element.querySelectorAll("[data-section='quality'] [data-worst] tbody tr")];
    expect(rows.map((row) => row.getAttribute("data-change"))).toEqual([
      "20261104-tabla",
      "20261103-sin-titulo",
    ]);

    const titled = changeCell(rows[0]);
    expect(titled.links).toEqual([["La tabla se ordena", "/changes/20261104-tabla"]]);
    expect(titled.id).toBe("20261104-tabla");
    const id = rows[0]?.querySelector("[data-id]");
    expect(id?.className).toContain("font-mono");
    expect(id?.className).toContain("text-text-muted");
    expect(id?.closest("a")).toBeNull();
    expect(text(rows[0]?.querySelector("[data-failed]"))).toBe("3 of 5");

    const plain = changeCell(rows[1]);
    expect(plain.links).toEqual([["20261103-sin-titulo", "/changes/20261103-sin-titulo"]]);
    expect(plain.hasId).toBe(false);
    expect(text(rows[1]?.querySelector("td"))).toBe("20261103-sin-titulo");
  });
});
