// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { DERIVER } from "../data/changes-store";
import { type ChangeRecord, SpectyData } from "../data/records";
import { sampleRecords } from "../data/sample-records";
import { deriveViews } from "../data/views";
import { Embedded } from "./embedded";

/** What the host gives the view: the one change the tool worked on. */
class OneChange extends SpectyData {
  constructor(private readonly record: ChangeRecord) {
    super();
  }

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([this.record]);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** In review, with every section of the spec. */
const REVISED = "20261016-justificar-faltas";

async function embedded(id: string): Promise<HTMLElement> {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.id === id);
  if (record === undefined) throw new Error(`no sample ${id}`);
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useValue: new OneChange(record) },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Embedded);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  return fixture.nativeElement as HTMLElement;
}

describe("the look of the embedded view in the chat", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC10: is one panel that holds the header and the cards", async () => {
    const element = await embedded(REVISED);
    const panel = element.querySelector("main[data-panel]");
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('header[data-card="change"]')).not.toBeNull();
    expect(panel?.querySelector("sp-spec-cards section[data-card]")).not.toBeNull();
  });

  it("AC10: puts each card's title and hint on one line, the hint cut short where it does not fit", async () => {
    const element = await embedded(REVISED);
    const headers = [...element.querySelectorAll("sp-spec-cards section[data-card] h2 button")];
    expect(headers.length).toBeGreaterThan(1);
    for (const header of headers) {
      const title = header.querySelector("[data-title]");
      const hint = header.querySelector("[data-hint]");
      expect(title, header.textContent ?? "").not.toBeNull();
      expect(hint, header.textContent ?? "").not.toBeNull();
      // Side by side in the same row, not stacked.
      expect(hint?.parentElement).toBe(title?.parentElement);
      expect(hint?.parentElement?.classList.contains("flex-col")).toBe(false);
      expect(hint?.classList.contains("truncate")).toBe(true);
    }
  });

  it("AC10: writes the open cards' content in 14 px text", async () => {
    const element = await embedded(REVISED);
    const bodies = [...element.querySelectorAll("sp-spec-cards [data-card-body]")];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.classList.contains("text-sm")).toBe(true);
    }
  });
});
