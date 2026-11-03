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

/** The prototype with a lesson and a pending item in the memory. */
@Injectable()
class WithLesson extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve({
      entries: [
        {
          id: "P1",
          kind: "pending",
          status: "open",
          created: "2026-11-01T10:00:00.000Z",
          origin: { by: "claude-code" },
          text: "Un pendiente",
        },
        {
          id: "P3",
          kind: "lesson",
          status: "open",
          created: "2026-11-03T10:00:00.000Z",
          origin: { by: "claude-code" },
          paths: ["packages/ui/src/**", "packages/ui/src/main.ts"],
          text: "El hilo principal solo importa de core/light.",
        },
      ],
      changes: [],
    });
  }
}

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
      { provide: SpectyData, useClass: WithLesson },
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
  const choose = async (kind: string) => {
    page()?.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`)?.click();
    await settle();
  };
  return { page, keys, choose };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("lessons in the memory page", () => {
  it("AC3: are in their own section, with their paths", async () => {
    const { page, keys } = await open();
    expect(keys()).toEqual(["work", "lessons"]);
    const section = page()?.querySelector('[data-section="lessons"]');
    expect(text(section?.querySelector("h2"))).toBe("Lecciones");
    const row = text(section?.querySelector('[data-entry="P3"]'));
    expect(row).toContain("lección");
    expect(row).toContain("packages/ui/src/**, packages/ui/src/main.ts");
  });

  it("AC3: can be filtered by their kind", async () => {
    const { page, keys, choose } = await open();
    const option = page()?.querySelector('input[type="radio"][value="lesson"]')?.closest("label");
    expect(text(option)).toBe("Lecciones");
    await choose("lesson");
    expect(keys()).toEqual(["lessons"]);
  });
});
