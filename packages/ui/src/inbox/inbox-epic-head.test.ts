// SPDX-License-Identifier: Apache-2.0
// The head of an epic's card in the Inbox: in implementation, how its slices go instead of its phase.
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

/** What the epic's own record says beyond its spec: who holds it and where it lives. */
type Extra = Pick<ChangeRecord, "orphan" | "away" | "folder">;

/**
 * The sample project with the epic «Panel académico» in `phase`, sized M like the change whose
 * state it takes, and `slices` its slices.
 */
function epicRecords(
  phase: ChangeRecord["state"]["phase"],
  slices: Readonly<Record<string, string>> = SLICES,
  extra: Extra = {},
): readonly ChangeRecord[] {
  const records = sampleRecords(Date.now());
  const base = records[0] ?? fail();
  const epic: ChangeRecord = {
    spec: ["---", "kind: epic", "---", "", "# Panel académico", "", ...CORTES, ""].join("\n"),
    state: { ...base.state, id: EPIC, kind: "epic", phase },
    phaseSince: new Date().toISOString(),
    folder: `/repo/.worktrees/${EPIC}`,
    ...extra,
  };
  return [
    epic,
    ...records.map((record) => {
      const slice = slices[record.state.id];
      if (slice === undefined) return record;
      const front = (line: string) => `${line}\nepic: ${EPIC}\nslice: ${slice}`;
      return { ...record, spec: record.spec.replace(/^kind: \w+$/m, front) };
    }),
  ];
}

/** What the source answers when the card asks for the change of each slice. */
type Answer = (epic: string) => Promise<readonly SliceChangeRecord[] | undefined>;

/** The Inbox over `records`, in `lang`, with a source that answers `sliceChanges` with `answer`. */
async function open(records: readonly ChangeRecord[], lang: "es" | "en" = "es", answer?: Answer) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  class Given extends SpectyData {
    changes(): Promise<readonly ChangeRecord[]> {
      return Promise.resolve(records);
    }
    subscribe(): () => void {
      return () => undefined;
    }
    override sliceChanges(epic: string): Promise<readonly SliceChangeRecord[] | undefined> {
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
  await TestBed.inject(Router).navigateByUrl("/");
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  return element.querySelector<HTMLElement>(
    `[data-epic-group="${EPIC}"] sp-inbox-row[data-epic-head]`,
  );
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("the head of an epic's card in the Inbox", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC6: shows, in implementation, its progress with a ring in place of its phase, and the tally of its slices", async () => {
    const head = await open(epicRecords("implementing"));
    expect(head?.dataset.id).toBe(EPIC);
    expect(head?.querySelector("sp-phase-badge")).toBeNull();
    const progress = head?.querySelector("[data-epic-progress]");
    expect(text(progress)).toBe("1/5 cortes");
    // The ring's arc is the share finished: one of five.
    expect(
      progress?.querySelector("[data-ring] [data-arc]")?.getAttribute("stroke-dasharray"),
    ).toBe("20 100");
    expect(text(head?.querySelector("[data-tally]"))).toBe(
      "1 de 5 terminados · 1 te espera · 1 en marcha · 1 listo para empezar · 1 espera a otro corte",
    );
    // Neither what it does with its size, nor its folder.
    expect(head?.querySelector("[data-waits]")).toBeNull();
    expect(head?.querySelector("[data-folder]")).toBeNull();
    expect(text(head)).not.toContain("· M");
    // Its times and its link stay.
    expect(text(head?.querySelector("[data-started]"))).toMatch(/^Empezó hace /);
    expect(head?.querySelector("a")?.getAttribute("href")).toBe(`/changes/${EPIC}?tab=progress`);
  });

  it("AC6: says its progress and its tally in English, with only the parts that have slices", async () => {
    const head = await open(epicRecords("implementing", { [C1]: "C1" }), "en");
    expect(text(head?.querySelector("[data-epic-progress]"))).toBe("1/5 slices");
    expect(text(head?.querySelector("[data-tally]"))).toBe(
      "1 of 5 finished · 3 ready to start · 1 waits for another slice",
    );
  });

  it("AC6: shows, in any other phase, the phase, what it waits for with its button and, finished, its times", async () => {
    const review = await open(epicRecords("review", {}));
    expect(review?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("review");
    expect(review?.querySelector("[data-epic-progress]")).toBeNull();
    expect(review?.querySelector("[data-tally]")).toBeNull();
    expect(text(review?.querySelector("[data-waits]"))).toMatch(/^Spec por revisar/);
    expect(text(review?.querySelector("sp-button"))).toBe("Revisar spec");
    const done = await open(epicRecords("done", { [C1]: "C1" }));
    expect(done?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    expect(done?.querySelector("[data-epic-progress]")).toBeNull();
    expect(text(done?.querySelector("[data-started]"))).toMatch(/^Empezó el /);
    expect(text(done?.querySelector("[data-took]"))).toMatch(/^Tardó /);
  });

  it("AC7: does not say, in implementation, that no conversation holds the epic, and names the slices nobody started", async () => {
    const holds: readonly Extra[] = [{ orphan: true }, { away: { tool: "claude-code", ago: 30 } }];
    for (const extra of holds) {
      const head = await open(epicRecords("implementing", { [C1]: "C1" }, extra));
      expect([extra, head?.querySelector("[data-unheld]")]).toEqual([extra, null]);
      expect([extra, text(head?.querySelector("[data-idle]"))]).toEqual([
        extra,
        "Ningún corte en marcha: nadie empezó C2, C3 ni C5",
      ]);
    }
    const none = await open(epicRecords("implementing", {}));
    expect(text(none?.querySelector("[data-idle]"))).toBe(
      "Ningún corte en marcha: nadie empezó C1 ni C3",
    );
    expect(text(none?.querySelector("[data-tally]"))).toBe(
      "0 de 5 terminados · 2 listos para empezar · 3 esperan a otro corte",
    );
    const english = await open(epicRecords("implementing", { [C1]: "C1" }), "en");
    expect(text(english?.querySelector("[data-idle]"))).toBe(
      "No slice under way: nobody started C2, C3 or C5",
    );
  });

  it("AC7: says nothing of idle slices while one has an open change or the source has not answered", async () => {
    const running = await open(epicRecords("implementing"));
    expect(running?.querySelector("[data-idle]")).toBeNull();
    const silent = await open(
      epicRecords("implementing", { [C1]: "C1" }),
      "es",
      () => new Promise(() => undefined),
    );
    expect(silent?.querySelector("[data-idle]")).toBeNull();
    expect(text(silent?.querySelector("[data-tally]"))).toBe("1 de 5 terminados");
    // Out of implementation, an epic nobody holds still says so.
    const review = await open(epicRecords("review", {}, { orphan: true }));
    expect(text(review?.querySelector("[data-unheld]"))).toBe("Ninguna conversación lo lleva");
  });
});

function fail(): never {
  throw new Error("missing fixture record");
}
