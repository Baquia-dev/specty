// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import { DERIVER } from "../data/changes-store";
import { McpAppData } from "../data/mcp-app";
import { type ChangeRecord, SpectyData } from "../data/records";
import { sampleRecords } from "../data/sample-records";
import { ActionError } from "../data/source";
import { deriveViews } from "../data/views";
import { Embedded, embeddedProviders } from "./embedded";

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

/** A source that could not read the change: it says why. */
class Unreadable extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.reject(
      new ActionError({
        es: "No hay ningún cambio abierto en esa carpeta.",
        en: "No change is open in that folder.",
      }),
    );
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** The embedded view on a source with only `record`. */
function embedded(record: ChangeRecord) {
  return embeddedOn(new OneChange(record));
}

/** The embedded view on `source`. */
async function embeddedOn(source: SpectyData) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useValue: source },
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

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("the embedded view of an MCP App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("AC1: shows only the Spec tab of a change in review, with no inbox, tabs or actions", async () => {
    const record = inPhase("review");
    const element = await embedded(record);
    expect(text(element)).toContain(deriveViews([record])[0]?.title ?? "no title");
    expect(element.querySelector("sp-spec-cards")).not.toBeNull();
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

  it("AC5: puts the change's header in a card, marks the root and shows the spec as cards", async () => {
    for (const phase of ["review", "draft"]) {
      const record = inPhase(phase);
      const element = await embedded(record);
      const header = element.querySelector('header[data-card="change"]');
      expect(header, phase).not.toBeNull();
      expect(header?.querySelector("sp-phase-badge"), phase).not.toBeNull();
      expect(text(header), phase).toContain(record.state.id);
      expect(text(header), phase).toContain(deriveViews([record])[0]?.title ?? "no title");
      expect(document.documentElement.hasAttribute("data-embedded"), phase).toBe(true);
      expect(element.querySelector("sp-spec-cards"), phase).not.toBeNull();
      expect(element.querySelector("sp-spec-review"), phase).toBeNull();
    }
    // The line of what the change waits for stays in the header's card.
    const waiting = await embedded(inPhase("review"));
    expect(text(waiting.querySelector('header[data-card="change"]'))).toContain("specty approve");
    // The other tabs keep their content, under the same header.
    const working = await embedded(inPhase("implementing"));
    expect(working.querySelector('header[data-card="change"]')).not.toBeNull();
    expect(working.querySelector("sp-progress-tab")).not.toBeNull();
    expect(working.querySelector("sp-spec-cards")).toBeNull();
  });

  it("AC6: says why it cannot read the change instead of waiting for it", async () => {
    const element = await embeddedOn(new Unreadable());
    expect(text(element)).toContain("No hay ningún cambio abierto en esa carpeta.");
    expect(text(element)).not.toContain("Esperando el cambio");
  });

  it("AC7: starts with the source of the host and derives in the main thread, with no worker", async () => {
    let started = 0;
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          started += 1;
        }
        addEventListener() {}
        postMessage() {}
        terminate() {}
      },
    );
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...embeddedProviders()] });
    const records = sampleRecords(Date.now());
    const views = await TestBed.inject(DERIVER)(records);
    expect(views.map((view) => view.id)).toEqual(records.map((record) => record.state.id));
    expect(started).toBe(0);
    expect(TestBed.inject(SpectyData)).toBeInstanceOf(McpAppData);
  });
});
