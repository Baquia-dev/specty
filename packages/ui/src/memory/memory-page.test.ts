// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, type MemoryRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** The prototype with nothing in the memory and no open change. */
@Injectable()
class EmptyMemory extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve({ entries: [], changes: [] });
  }
}

async function open(source: typeof FixtureData = FixtureData) {
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
      { provide: SpectyData, useClass: source },
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
  const page = () => element.querySelector<HTMLElement>("sp-memory-page");
  const section = (key: string) => page()?.querySelector<HTMLElement>(`[data-section="${key}"]`);
  const entryRow = (id: string) => page()?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
  const changeRow = (key: string, id: string) =>
    section(key)?.querySelector<HTMLElement>(`[data-change="${id}"]`);
  return { element, page, section, entryRow, changeRow };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the memory page", () => {
  it("AC2: is in the navigation, and shows what is the person's turn", async () => {
    const { element, section, entryRow, changeRow } = await open();
    const link = [...element.querySelectorAll("nav a")].find((a) => text(a) === "Memoria");
    expect(link?.getAttribute("href")).toBe("/memory");
    expect(text(section("turn")?.querySelector("h2"))).toBe("Te toca");
    expect(text(entryRow("P18"))).toContain(
      "Propuesta para descartar por claude-code: «Duplica P15.»",
    );
    expect(text(changeRow("turn", "20261103-sin-permisos-devin-cursor"))).toContain(
      "espera tu decisión",
    );
    expect(text(entryRow("P19"))).toContain("Recompilar el dist de main después de cada cierre");
  });

  it("AC2: shows who holds each open change, the orphans, and the way into each", async () => {
    const { section, changeRow } = await open();
    expect(text(section("holders")?.querySelector("h2"))).toBe("Quién lleva cada cambio");
    const held = changeRow("holders", "20261030-memoria-de-specty");
    expect(text(held)).toContain("lo lleva claude-code, hace 2 min");
    expect(held?.querySelector("a")?.getAttribute("href")).toBe(
      "/changes/20261030-memoria-de-specty",
    );
    const orphan = changeRow("holders", "20261029-tooltip-con-contexto");
    expect(text(orphan)).toContain("huérfano");
    expect(text(orphan)).toContain("ninguna sesión lo lleva");
  });

  it("AC3: lists the pending items, improvements and decisions, with who took them and their origin", async () => {
    const { section, entryRow } = await open();
    expect(text(section("work")?.querySelector("h2"))).toBe("Pendientes y mejoras");
    expect(text(entryRow("P1"))).toContain("P1");
    expect(text(entryRow("P1"))).toContain("pendiente");
    expect(text(entryRow("P6"))).toContain("mejora");
    expect(text(entryRow("P6"))).toContain("20261103-memoria-tarjeta-de-inicio-2");
    expect(text(entryRow("P10"))).toContain("tomada por 20261104-test-ui-estable");
    expect(text(entryRow("P15"))).toContain("la persona");
    expect(entryRow("P20")).toBeNull();
    expect(section("work")?.querySelector('[data-entry="P18"]')).toBeNull();
    expect(text(entryRow("D1"))).toContain("«la que tú recomiendas»");
  });

  it("AC3: says the memory is empty when there is nothing to show", async () => {
    const { page } = await open(EmptyMemory);
    expect(text(page())).toContain("La memoria de Specty está vacía.");
    expect(page()?.querySelector("[data-section]")).toBeNull();
  });
});
