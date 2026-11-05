// SPDX-License-Identifier: Apache-2.0
// The page of a change the Inbox has not loaded: change-page.test.ts is full, so it has its own file.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const DONE = "20261015-redondeo-promedios";
const UNKNOWN = "20990101-no-existe";

/** The sample project without DONE in its list, as a source paging the finished changes. */
@Injectable()
class Unloaded extends FixtureData {
  readonly asked: string[] = [];

  override async changes(): Promise<readonly ChangeRecord[]> {
    return (await super.changes()).filter((record) => record.state.id !== DONE);
  }

  override async change(id: string): Promise<ChangeRecord | undefined> {
    this.asked.push(id);
    return (await super.changes()).find((record) => record.state.id === id);
  }
}

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
      { provide: SpectyData, useClass: Unloaded },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl(`/changes/${id}`);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const source = TestBed.inject(SpectyData);
  if (!(source instanceof Unloaded)) throw new Error("the page does not run on the test's source");
  return { element, source };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage of a change the Inbox has not loaded", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows a finished change the Inbox has not loaded, read from the source by its id", async () => {
    const { element, source } = await open(DONE);
    const hero = element.querySelector("sp-change-page [data-hero]");
    expect(text(hero?.querySelector("h1"))).toBe("Corregir el redondeo de promedios");
    expect(hero?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    expect(element.querySelector("sp-change-page [role=tab]")).not.toBeNull();
    expect(source.asked).toEqual([DONE]);
  });

  it("AC2: says the change does not exist once the source does not have it either", async () => {
    const { element, source } = await open(UNKNOWN);
    const empty = element.querySelector("sp-change-page [role=status]");
    expect(text(empty)).toContain("No existe ese cambio");
    expect(text(empty)).toContain(UNKNOWN);
    expect(source.asked).toEqual([UNKNOWN]);
  });

  it("AC4: does not ask the source for a change the Inbox has loaded", async () => {
    const { element, source } = await open("20261021-login-google");
    expect(text(element.querySelector("sp-change-page [data-hero] h1"))).toBe("Login con Google");
    expect(source.asked).toEqual([]);
  });
});
