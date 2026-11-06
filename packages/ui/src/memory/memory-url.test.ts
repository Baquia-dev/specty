// SPDX-License-Identifier: Apache-2.0
// The memory page opened from a link, such as a change's page gives: the search and the closed
// entries come from the URL.
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

async function open(url: string) {
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
  await TestBed.inject(Router).navigateByUrl(url);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const page = () => element.querySelector<HTMLElement>("sp-memory-page");
  const search = () => page()?.querySelector<HTMLInputElement>('input[type="search"]');
  const closed = () => page()?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const entry = (id: string) => page()?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
  return { page, search, closed, entry };
}

describe("the memory page opened from a link", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC3: takes the search from `q` and keeps what contains it", async () => {
    const { search, closed, entry } = await open("/memory?q=P6");
    expect(search()?.value).toBe("P6");
    expect(closed()?.checked).toBe(false);
    expect(entry("P6")).not.toBeNull();
    expect(entry("P1")).toBeNull();
    expect(entry("D1")).toBeNull();
  });

  it("AC3: shows the done and dropped entries with `closed=1`, and the one searched among them", async () => {
    const { page, search, closed, entry } = await open("/memory?q=P20&closed=1");
    expect(search()?.value).toBe("P20");
    expect(closed()?.checked).toBe(true);
    expect(page()?.querySelector('[data-section="closed"] [data-entry="P20"]')).not.toBeNull();
    expect(entry("P1")).toBeNull();
  });

  it("AC3: without `closed`, a done entry searched by its id stays out of view", async () => {
    const { closed, entry } = await open("/memory?q=P20");
    expect(closed()?.checked).toBe(false);
    expect(entry("P20")).toBeNull();
  });

  it("AC3: without parameters, the search is empty and the closed entries are hidden", async () => {
    const { search, closed, entry } = await open("/memory");
    expect(search()?.value).toBe("");
    expect(closed()?.checked).toBe(false);
    expect(entry("P1")).not.toBeNull();
  });
});
