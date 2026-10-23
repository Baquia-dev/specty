// SPDX-License-Identifier: Apache-2.0
// The change page with a closing: change-page.test.ts is full, so the closing has its own file.
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const REMINDERS = "20261017-recordatorios-correo";
const PANEL = "20261018-asistencia-curso";

async function open(id: string) {
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
  const element: HTMLElement = fixture.nativeElement;
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl(`/changes/${id}`);
  await settle();
  const hero = () => element.querySelector("sp-change-page [data-hero]");
  const bar = () => element.querySelector("sp-change-page [data-sticky]");
  const source = TestBed.inject(SpectyData);
  return { element, settle, hero, bar, source };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage with a closing", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("offers «Confirmar y archivar» beside the title and in the compact bar once it is sent (AC2)", async () => {
    const { hero, bar } = await open(REMINDERS);
    expect(text(hero()?.querySelector("[data-waiting]"))).toContain(
      "Espera que confirmes el cierre",
    );
    expect(text(hero()?.querySelector("sp-closing-actions"))).toBe("Confirmar y archivar");
    const compact = bar()?.querySelector("sp-closing-actions");
    expect(compact?.hasAttribute("data-compact")).toBe(true);
    expect(text(bar()?.querySelector("[data-revision]"))).toContain("cierre por confirmar");
  });

  it("offers nothing while the agent writes the closing (AC2)", async () => {
    const { element, settle, hero, bar, source } = await open(PANEL);
    await source.decideResult(PANEL, { kind: "accept" });
    await settle();
    expect(hero()?.querySelector("sp-closing-actions")).toBeNull();
    expect(bar()?.querySelector("sp-closing-actions")).toBeNull();
    expect(text(bar()?.querySelector("[data-revision]"))).toContain("aceptada, en cierre");
    expect(element.querySelector("sp-closing-view [data-writing]")).not.toBeNull();
  });

  it("is done after confirming, with the closing still in sight and no actions (AC3)", async () => {
    const { element, settle, hero, bar } = await open(REMINDERS);
    hero()?.querySelector<HTMLButtonElement>("sp-closing-actions button")?.click();
    await settle();
    const dialog = document.querySelector("[role=dialog]");
    [...(dialog?.querySelectorAll<HTMLButtonElement>("sp-button button") ?? [])]
      .find((button) => text(button) === "Confirmar y archivar")
      ?.click();
    await settle();
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(hero()?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    expect(element.querySelector("sp-closing-actions")).toBeNull();
    expect(text(bar()?.querySelector("[data-revision]"))).toContain("cerrada");
    // The page stays on Aceptación: the closing just confirmed is still there to read.
    const selected = element.querySelector("sp-change-page [role=tab][aria-selected=true]");
    expect(text(selected)).toBe("Aceptación");
    expect(text(element.querySelector("sp-closing-view [data-meta]"))).toBe("confirmado");
    expect(element.querySelectorAll("sp-closing-view [data-part]")).toHaveLength(4);
  });
});
