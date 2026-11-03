// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type Bilingual, type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** The prototype as a server the agent started: no decisions. */
@Injectable()
class ReadOnlyData extends FixtureData {
  override readOnly(): Promise<Bilingual | undefined> {
    return Promise.resolve({ es: "Solo lectura.", en: "Read only." });
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
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl("/memory");
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-memory-page");
  const row = (id: string) => page()?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
  const buttons = (scope: Element | null | undefined) =>
    [...(scope?.querySelectorAll<HTMLButtonElement>("button") ?? [])].map((button) =>
      (button.textContent ?? "").trim(),
    );
  const press = async (scope: Element | null | undefined, label: string) => {
    const button = [...(scope?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (candidate) => (candidate.textContent ?? "").trim() === label,
    );
    if (button === undefined) throw new Error(`no button «${label}»`);
    button.click();
    await settle();
  };
  return { page, row, buttons, press, settle };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("the person's actions in the memory page", () => {
  it("AC1: drops an entry through a dialog with the reason", async () => {
    const { row, press, settle } = await open();
    await press(row("P1"), "Descartar");
    const dialog = document.querySelector<HTMLElement>("sp-drop-entry");
    expect(text(dialog)).toContain("Descartar P1");
    const reason = dialog?.querySelector<HTMLTextAreaElement>("textarea");
    if (reason === null || reason === undefined) throw new Error("no reason field");
    reason.value = "Ya no aplica.";
    reason.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    await press(dialog, "Descartar");
    expect(row("P1")).toBeNull();
    expect(document.querySelector("sp-drop-entry")).toBeNull();
  });

  it("AC1: brings the reason of a proposal into the dialog", async () => {
    const { row, press } = await open();
    await press(row("P18"), "Descartar");
    const reason = document.querySelector<HTMLTextAreaElement>("sp-drop-entry textarea");
    expect(reason?.value).toBe("Duplica P15.");
    await press(document.querySelector("sp-drop-entry"), "Descartar");
    expect(row("P18")).toBeNull();
  });

  it("AC2: keeps a proposed entry and marks a reminder done", async () => {
    const { page, row, press } = await open();
    await press(row("P18"), "Mantener");
    expect(page()?.querySelector('[data-section="turn"] [data-entry="P18"]')).toBeNull();
    expect(page()?.querySelector('[data-section="work"] [data-entry="P18"]')).not.toBeNull();
    await press(row("P19"), "Marcar hecho");
    expect(row("P19")).toBeNull();
  });

  it("AC3: shows no actions and says it is read-only when the person cannot decide", async () => {
    const { page, row, buttons } = await open(ReadOnlyData);
    expect(text(page())).toContain("Solo lectura: arranca specty ui desde tu terminal");
    for (const id of ["P1", "P18", "P19", "D1"]) {
      expect(buttons(row(id))).not.toContain("Descartar");
      expect(buttons(row(id))).not.toContain("Mantener");
      expect(buttons(row(id))).not.toContain("Marcar hecho");
    }
  });
});
