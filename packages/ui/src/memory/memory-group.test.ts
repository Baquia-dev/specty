// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, type MemoryRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const EPIC = "20261101-panel-academico";
const FEATURE = "20261102-exportar-notas";
const SLICE = "20261104-notas-por-curso";
const LOST = "20261020-perdido";

const entry = (id: string, day: number, change?: string): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  origin: change === undefined ? { by: "claude-code" } : { change, by: "claude-code" },
  text: `Texto de ${id}`,
});

/** A feature, the slice C2 of an epic that is no change of origin itself, one gone, and none. */
const ORIGINS = {
  [FEATURE]: { title: "Exportar notas", kind: "standard", phase: "implementing" },
  [SLICE]: {
    title: "Notas por curso",
    kind: "standard",
    phase: "review",
    epic: { id: EPIC, title: "Panel académico", slice: "C2" },
  },
  [LOST]: { title: LOST },
} as const;

const RECORD = {
  entries: [entry("P1", 1), entry("P2", 2, FEATURE), entry("P3", 3, SLICE), entry("P4", 4, LOST)],
  changes: [],
  origins: ORIGINS,
};

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** The prototype with a memory whose pending items came from a feature, a slice and a gone change. */
@Injectable()
class GroupedMemory extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve(RECORD);
  }
}

async function open(lang: "es" | "en") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: GroupedMemory },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl("/memory");
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const work = () => element.querySelector<HTMLElement>('sp-memory-page [data-section="work"]');
  const group = (id: string) => work()?.querySelector<HTMLElement>(`[data-group="${id}"]`);
  /** The first head of a group: its own, before those of its slices. */
  const head = (id: string) => group(id)?.querySelector<HTMLElement>("[data-group-head]");
  const slice = (epic: string, id: string) =>
    group(epic)?.querySelector<HTMLElement>(`[data-feature="${id}"]`);
  return { work, group, head, slice };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the memory page by features", () => {
  it("AC2: groups the pending items under their feature, the slices inside their epic, and the rest in «Sin feature»", async () => {
    const { work, group, head, slice } = await open("es");
    const groups = [...(work()?.querySelectorAll("[data-group]") ?? [])];
    expect(groups.map((found) => found.getAttribute("data-group"))).toEqual([
      LOST,
      EPIC,
      FEATURE,
      "none",
    ]);
    // A feature: its phase, its title with the link to its page, its badge and its entries below.
    expect(text(head(FEATURE))).toContain("Exportar notas");
    expect(text(head(FEATURE))).toContain("Feature");
    expect(head(FEATURE)?.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe(
      "implementing",
    );
    expect(head(FEATURE)?.querySelector("a")?.getAttribute("href")).toBe(`/changes/${FEATURE}`);
    expect(group(FEATURE)?.querySelector('[data-entry="P2"]')).not.toBeNull();
    // An epic heads the group of its slices, each with its own head and its entries.
    expect(text(head(EPIC))).toContain("Panel académico");
    expect(text(head(EPIC))).toContain("Épica");
    expect(head(EPIC)?.querySelector("a")?.getAttribute("href")).toBe(`/changes/${EPIC}`);
    const sliceHead = slice(EPIC, SLICE)?.querySelector("[data-group-head]");
    expect(text(sliceHead)).toContain("Notas por curso");
    expect(text(sliceHead)).toContain("Feature · C2");
    expect(sliceHead?.querySelector("[data-phase]")?.getAttribute("data-phase")).toBe("review");
    expect(sliceHead?.querySelector("a")?.getAttribute("href")).toBe(`/changes/${SLICE}`);
    expect(slice(EPIC, SLICE)?.querySelector('[data-entry="P3"]')).not.toBeNull();
    // A change the server did not find: its id, with no phase nor link.
    expect(text(head(LOST))).toContain(LOST);
    expect(head(LOST)?.querySelector("a")).toBeNull();
    expect(head(LOST)?.querySelector("[data-phase]")).toBeNull();
    expect(group(LOST)?.querySelector('[data-entry="P4"]')).not.toBeNull();
    // What came from no change, last.
    expect(text(head("none"))).toBe("Sin feature");
    expect(group("none")?.querySelector('[data-entry="P1"]')).not.toBeNull();
  });

  it("AC5: says its heads in English and in Spanish", async () => {
    const english = await open("en");
    expect(text(english.head("none"))).toBe("No feature");
    expect(text(english.head(EPIC))).toContain("Epic");
    expect(text(english.slice(EPIC, SLICE)?.querySelector("[data-group-head]"))).toContain(
      "Feature · C2",
    );
    const spanish = await open("es");
    expect(text(spanish.head("none"))).toBe("Sin feature");
    expect(text(spanish.head(EPIC))).toContain("Épica");
    expect(text(spanish.slice(EPIC, SLICE)?.querySelector("[data-group-head]"))).toContain(
      "Feature · C2",
    );
  });
});
