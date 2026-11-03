// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
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
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl("/memory");
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-memory-page");
  const keys = () =>
    [...(page()?.querySelectorAll<HTMLElement>("[data-section]") ?? [])].map(
      (section) => section.dataset.section,
    );
  const search = async (value: string) => {
    const input = page()?.querySelector<HTMLInputElement>('input[type="search"]');
    if (input === null || input === undefined) throw new Error("no search");
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
  };
  const choose = async (kind: string) => {
    page()?.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`)?.click();
    await settle();
  };
  const showClosed = async () => {
    page()?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    await settle();
  };
  return { page, keys, search, choose, showClosed };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the toolbar of the memory page", () => {
  it("AC1: keeps only what contains the search, and leaves out the empty sections", async () => {
    const { page, keys, search } = await open();
    expect(keys()).toEqual(["turn", "holders", "work", "decisions"]);
    await search("TOOLTIP");
    expect(keys()).toEqual(["holders"]);
    expect(page()?.querySelector('[data-change="20261029-tooltip-con-contexto"]')).not.toBeNull();
  });

  it("AC2: keeps only the entries of the kind chosen, without the changes", async () => {
    const { page, keys, choose } = await open();
    await choose("decision");
    expect(keys()).toEqual(["decisions"]);
    expect(page()?.querySelector('[data-entry="D1"]')).not.toBeNull();
    await choose("all");
    expect(keys()).toEqual(["turn", "holders", "work", "decisions"]);
  });

  it("AC3: shows the done and dropped entries on demand, and says when nothing matches", async () => {
    const { page, keys, search, showClosed } = await open();
    expect(page()?.querySelector('[data-entry="P20"]')).toBeNull();
    await showClosed();
    expect(keys().at(-1)).toBe("closed");
    const closed = page()?.querySelector('[data-section="closed"]');
    expect(text(closed?.querySelector("h2"))).toBe("Hechas y descartadas");
    expect(text(closed?.querySelector('[data-entry="P20"]'))).toContain("hecha");
    await search("nada de esto existe");
    expect(keys()).toEqual([]);
    expect(text(page())).toContain("Nada coincide con el filtro.");
    expect(text(page())).not.toContain("La memoria de Specty está vacía.");
  });
});
