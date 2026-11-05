// SPDX-License-Identifier: Apache-2.0
// The page of a finished change the Inbox has in a page: the Inbox keeps only its summary, so the
// page asks the source for its record by its id.
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { sampleRecords } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import type { FinishedPage, FinishedRequest } from "../data/source";
import { deriveViews } from "../data/views";

const DONE = "20261015-redondeo-promedios";

const isFinished = (record: ChangeRecord) =>
  record.state.phase === "done" || record.state.phase === "cancelled";

/** A source that gives every change in `changes`: it works out the pages as any source does. */
class Everything extends SpectyData {
  constructor(private readonly records: readonly ChangeRecord[]) {
    super();
  }

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.records);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/**
 * The sample project as the local server gives it: the open changes in the list, the finished ones
 * only in their pages and by their id.
 */
class Paging extends SpectyData {
  readonly records = sampleRecords(Date.now());
  readonly asked: string[] = [];

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(this.records.filter((record) => !isFinished(record)));
  }

  override finished(request: FinishedRequest): Promise<FinishedPage> {
    return new Everything(this.records).finished(request);
  }

  override change(id: string): Promise<ChangeRecord | undefined> {
    this.asked.push(id);
    return Promise.resolve(this.records.find((record) => record.state.id === id));
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** Lets the pages load, the router move and the source answer. */
async function settle(fixture: { whenStable(): Promise<unknown> }): Promise<void> {
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

/** The Inbox on `source`, with its first page of finished changes loaded. */
async function inbox(source: Paging) {
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
      { provide: SpectyData, useValue: source },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl("/");
  await settle(fixture);
  return { fixture, element };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ChangePage of a finished change the Inbox has in a page", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: asks the source for its record by its id and shows it whole, on the tab its link asks for", async () => {
    const source = new Paging();
    const { fixture, element } = await inbox(source);
    const link = element.querySelector<HTMLAnchorElement>(`sp-inbox-row[data-id="${DONE}"] a`);
    expect(link?.getAttribute("href")).toBe(`/changes/${DONE}?tab=history`);
    expect(source.asked).toEqual([]);

    link?.click();
    await settle(fixture);
    const page = element.querySelector("sp-change-page");
    expect(text(page?.querySelector("[data-hero] h1"))).toBe("Corregir el redondeo de promedios");
    expect(text(page?.querySelector("[role=tab][aria-selected=true]"))).toBe("Historial");
    // Its whole history, which only its record carries.
    const whole = deriveViews(source.records).find((view) => view.id === DONE);
    expect(whole?.history.length).toBeGreaterThan(0);
    expect(page?.querySelectorAll("[data-event]")).toHaveLength(whole?.history.length ?? -1);
    // Read by its id, though the Inbox has its summary.
    expect(source.asked).toEqual([DONE]);
  });
});
