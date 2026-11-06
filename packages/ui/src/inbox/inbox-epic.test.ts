// SPDX-License-Identifier: Apache-2.0
// The card of an epic in the Inbox: a line per slice of its Cortes section, across the phases.
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { sampleRecords } from "../data/fixtures";
import { type ChangeRecord, type SliceChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

const EPIC = "20261015-panel";
const C1 = "20261015-redondeo-promedios";
const C2 = "20261022-avisos-calificaciones";
const C3 = "20261021-login-google";

/** The Cortes section of the epic: C2 and C5 wait for C1, and C4 for C2 and C3. */
const CORTES = [
  "## Cortes",
  "",
  "- C1: Redondeo de promedios",
  "  - ac: AC1",
  "- C2: Avisos de calificaciones",
  "  - ac: AC1",
  "  - depends: C1",
  "- C3: Acceso con Google",
  "  - ac: AC1",
  "- C4: Chat entre docentes",
  "  - ac: AC1",
  "  - depends: C2, C3",
  "- C5: Recordatorios por correo",
  "  - ac: AC1",
  "  - depends: C1",
];

/** C1 finished, C2 waits for its tests to be approved and C3 is in progress; C4 and C5, none. */
const SLICES: Readonly<Record<string, string>> = { [C1]: "C1", [C2]: "C2", [C3]: "C3" };

/** The sample project with the epic «Panel académico» in `phase`, and `slices` its slices. */
function epicRecords(
  phase: ChangeRecord["state"]["phase"],
  slices: Readonly<Record<string, string>> = SLICES,
): readonly ChangeRecord[] {
  const records = sampleRecords(Date.now());
  const base = records[0] ?? fail();
  const epic: ChangeRecord = {
    spec: ["---", "kind: epic", "---", "", "# Panel académico", "", ...CORTES, ""].join("\n"),
    state: { ...base.state, id: EPIC, kind: "epic", phase },
    phaseSince: new Date().toISOString(),
  };
  return [
    epic,
    ...records.map((record) => {
      const slice = slices[record.state.id];
      if (slice === undefined) return record;
      // C1's change is a quick one: its spec keeps its kind and names the epic and the slice.
      const front = (line: string) => `${line}\nepic: ${EPIC}\nslice: ${slice}`;
      return { ...record, spec: record.spec.replace(/^kind: \w+$/m, front) };
    }),
  ];
}

/** What the source answers when the card asks for the change of each slice. */
type Answer = (epic: string) => Promise<readonly SliceChangeRecord[] | undefined>;

/** The Inbox over `records`, with a source that answers `sliceChanges` with `answer`. */
async function open(records: readonly ChangeRecord[], answer?: Answer) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  const asked: string[] = [];
  const listeners: (() => unknown)[] = [];
  class Given extends SpectyData {
    changes(): Promise<readonly ChangeRecord[]> {
      return Promise.resolve(records);
    }
    subscribe(listener: () => unknown): () => void {
      listeners.push(listener);
      return () => undefined;
    }
    override sliceChanges(epic: string): Promise<readonly SliceChangeRecord[] | undefined> {
      asked.push(epic);
      return answer === undefined ? Promise.resolve(undefined) : answer(epic);
    }
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: Given },
      {
        provide: DERIVER,
        useValue: (given: readonly ChangeRecord[]) => Promise.resolve(deriveViews(given)),
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
  await TestBed.inject(Router).navigateByUrl("/");
  await settle();
  const card = () => element.querySelector<HTMLElement>(`[data-epic-group="${EPIC}"]`);
  const lanes = () => [...(card()?.querySelectorAll<HTMLElement>("sp-inbox-lane") ?? [])];
  const lane = (slice: string) => lanes().find((item) => item.dataset.slice === slice);
  const cells = (slice: string) =>
    [...(lane(slice)?.querySelectorAll<HTMLElement>("[data-track] [data-cell]") ?? [])].map(
      (cell) => cell.dataset.cell,
    );
  const notify = async () => {
    for (const listener of listeners) listener();
    await settle();
  };
  return { fixture, element, settle, card, lanes, lane, cells, asked, notify };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const short = (id: string | undefined) => id?.replace(/^\d+-/, "");

describe("the card of an epic in the Inbox", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: draws under the epic's row a line per slice of its Cortes section, in order, under the stretches' headers", async () => {
    const { card, lanes, lane, cells, element } = await open(epicRecords("implementing"));
    expect(card()?.querySelector("sp-inbox-row[data-epic-head]")?.getAttribute("data-id")).toBe(
      EPIC,
    );
    expect(text(card()?.querySelector("[data-lane-steps]"))).toBe("Spec Tests Impl. Acept.");
    expect(lanes().map((item) => item.dataset.slice)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
    expect(lanes().map((item) => text(item.querySelector("[data-slice-id]")))).toEqual([
      "C1",
      "C2",
      "C3",
      "C4",
      "C5",
    ]);
    // Each title is the one its Cortes section gives it, linked to its change if it has one.
    const link = (slice: string) => lane(slice)?.querySelector("a");
    expect(text(link("C1"))).toBe("Redondeo de promedios");
    expect(link("C1")?.getAttribute("href")).toBe(`/changes/${C1}?tab=history`);
    expect(link("C2")?.getAttribute("href")).toBe(`/changes/${C2}?tab=progress`);
    expect(link("C3")?.getAttribute("href")).toBe(`/changes/${C3}?tab=progress`);
    expect(link("C4")).toBeNull();
    expect(text(lane("C4"))).toContain("Chat entre docentes");
    expect(cells("C1")).toEqual(["done", "done", "done", "done"]);
    expect(cells("C2")).toEqual(["past", "current", "empty", "empty"]);
    expect(cells("C3")).toEqual(["past", "past", "current", "empty"]);
    // The slices are lines of the card, not rows of the Inbox.
    for (const id of [C1, C2, C3]) {
      expect([id, element.querySelectorAll(`sp-inbox-row[data-id="${id}"]`).length]).toEqual([
        id,
        0,
      ]);
    }
  });

  it("AC2: shows every line finished and unfolded in an epic in acceptance or done, without asking", async () => {
    for (const phase of ["acceptance", "done"] as const) {
      const { lanes, lane, cells, asked } = await open(epicRecords(phase, { [C1]: "C1" }));
      expect([phase, lanes().map((item) => item.dataset.slice)]).toEqual([
        phase,
        ["C1", "C2", "C3", "C4", "C5"],
      ]);
      for (const slice of ["C1", "C2", "C3", "C4", "C5"]) {
        expect([phase, slice, cells(slice)]).toEqual([
          phase,
          slice,
          ["done", "done", "done", "done"],
        ]);
      }
      expect([phase, lane("C1")?.querySelector("a")?.getAttribute("href")]).toEqual([
        phase,
        `/changes/${C1}?tab=history`,
      ]);
      expect([phase, asked]).toEqual([phase, []]);
    }
  });

  it("AC3: says what a slice without a change waits for, in place of its track", async () => {
    const { lane } = await open(epicRecords("implementing"));
    expect(text(lane("C4")?.querySelector("[data-planned]"))).toBe("Espera a C2 y C3");
    expect(text(lane("C5")?.querySelector("[data-planned]"))).toBe("Listo para empezar");
    expect(lane("C4")?.querySelector("[data-track]")).toBeNull();
  });

  it("AC3: says, while the epic is in review, that a slice starts once approved or after its depends", async () => {
    const { lane } = await open(epicRecords("review", {}));
    const planned = (slice: string) => text(lane(slice)?.querySelector("[data-planned]"));
    expect(planned("C1")).toBe("Puede arrancar en cuanto apruebes");
    expect(planned("C2")).toBe("Tras C1");
    expect(planned("C3")).toBe("Puede arrancar en cuanto apruebes");
    expect(planned("C4")).toBe("Tras C2 y C3");
  });

  it("AC4: puts on a slice waiting for a decision its button, which opens its page, and marks its stretch", async () => {
    const { lane, settle } = await open(epicRecords("implementing"));
    const marked = [...(lane("C2")?.querySelectorAll<HTMLElement>("[data-cell]") ?? [])].map(
      (cell) => cell.hasAttribute("data-marked"),
    );
    expect(marked).toEqual([false, true, false, false]);
    expect(text(lane("C2")?.querySelector("sp-button"))).toBe("Aprobar tests");
    expect(lane("C3")?.querySelector("sp-button")).toBeNull();
    lane("C2")?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe(`/changes/${C2}?tab=progress`);
  });

  it("AC9: walks with j/k the epic's row and then each line with a change, focusing its link so Enter opens it", async () => {
    const { element, fixture } = await open(epicRecords("implementing"));
    const press = (key: string) =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    const current = () => element.querySelector<HTMLElement>('sp-inbox [aria-current="true"]');
    const walked: (string | undefined)[] = [];
    for (let step = 0; step < 12; step++) {
      walked.push(short(current()?.dataset.id));
      press("j");
      await fixture.whenStable();
    }
    const at = walked.indexOf("panel");
    expect(walked.slice(at, at + 4)).toEqual([
      "panel",
      "redondeo-promedios",
      "avisos-calificaciones",
      "login-google",
    ]);
    // The lines without a change are not stops: the next one is a row out of the card.
    const card = ["panel", "redondeo-promedios", "avisos-calificaciones", "login-google"];
    expect(walked[at + 4]).toBeDefined();
    expect(card).not.toContain(walked[at + 4]);
    // Back to C2's line: its link has the focus, so Enter opens it.
    for (let step = 0; step < walked.length && current()?.dataset.slice !== "C2"; step++) {
      press("k");
      await fixture.whenStable();
    }
    expect(current()?.tagName.toLowerCase()).toBe("sp-inbox-lane");
    expect(current()?.dataset.slice).toBe("C2");
    expect(document.activeElement).toBe(current()?.querySelector("a"));
  });

  it("AC11: links a finished slice to the change the source gives, though it is not loaded", async () => {
    const answer: Answer = () =>
      Promise.resolve([
        { slice: "C1", id: "20261001-redondeo-archivado", phase: "done" },
        { slice: "C2", id: C2, phase: "testing" },
        { slice: "C3", id: C3, phase: "implementing" },
      ]);
    const { lane, cells, asked, notify } = await open(
      epicRecords("implementing", { [C2]: "C2", [C3]: "C3" }),
      answer,
    );
    expect(asked[0]).toBe(EPIC);
    expect(lane("C1")?.dataset.state).toBe("done");
    expect(cells("C1")).toEqual(["done", "done", "done", "done"]);
    expect(lane("C1")?.querySelector("a")?.getAttribute("href")).toBe(
      "/changes/20261001-redondeo-archivado",
    );
    expect(text(lane("C5")?.querySelector("[data-planned]"))).toBe("Listo para empezar");
    // It asks again with each notice of the source.
    const before = asked.length;
    await notify();
    expect(asked.length).toBeGreaterThan(before);
  });

  it("AC11: leaves without state, while the source does not answer, a slice without a loaded change", async () => {
    const { lane, cells, asked } = await open(
      epicRecords("implementing", { [C2]: "C2", [C3]: "C3" }),
      () => new Promise(() => undefined),
    );
    expect(asked).toContain(EPIC);
    for (const slice of ["C1", "C4", "C5"]) {
      expect([slice, lane(slice)?.dataset.state]).toEqual([slice, "unknown"]);
      expect([slice, cells(slice)]).toEqual([slice, ["empty", "empty", "empty", "empty"]]);
      expect([slice, lane(slice)?.querySelector("[data-planned]")]).toEqual([slice, null]);
      expect([slice, lane(slice)?.querySelector("a")]).toEqual([slice, null]);
    }
    // The slices whose change is loaded show where they stand.
    expect(cells("C2")).toEqual(["past", "current", "empty", "empty"]);
  });
});

function fail(): never {
  throw new Error("missing fixture record");
}
