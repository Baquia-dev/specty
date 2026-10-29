// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { DERIVER } from "../data/changes-store";
import { type ChangeRecord, SpectyData } from "../data/records";
import { sampleRecords } from "../data/sample-records";
import { deriveViews } from "../data/views";
import { Embedded } from "./embedded";

/** What the host gives the view: the one change the tool worked on, and no way to decide. */
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

const inPhase = (phase: string) => {
  const record = sampleRecords(Date.now()).find((candidate) => candidate.state.phase === phase);
  if (record === undefined) throw new Error(`the sample has no change in ${phase}`);
  return record;
};

/** The embedded view on a source with only `record`. */
async function embedded(record: ChangeRecord) {
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

const text = (element: Element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("the embedded view of an MCP App", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows only the Spec tab of a change in review, with no inbox, tabs or actions", async () => {
    const record = inPhase("review");
    const element = await embedded(record);
    expect(text(element)).toContain(deriveViews([record])[0]?.title ?? "no title");
    expect(element.querySelector("sp-spec-review")).not.toBeNull();
    for (const other of ["sp-progress-tab", "sp-acceptance-tab", "sp-history-tab", "sp-inbox"]) {
      expect(element.querySelector(other), other).toBeNull();
    }
    expect(element.querySelector('[role="tablist"]')).toBeNull();
  });

  it("AC2: offers no button to decide, and says the command or specty ui instead", async () => {
    const element = await embedded(inPhase("review"));
    const buttons = [...element.querySelectorAll("button")].map(text);
    expect(
      buttons.filter((label) => /Aprobar|Rechazar|Comentar|Confirmar|Aceptar/.test(label)),
    ).toEqual([]);
    expect(text(element)).toContain("specty approve");
    expect(text(element)).toContain("specty ui");
  });
});
