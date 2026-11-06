// SPDX-License-Identifier: Apache-2.0
// What the store keeps of each finished change of a page: only its summary. Its Inbox row and the
// link of its epic's slice look as they do with the whole change.
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { ChangeState } from "@baquia-dev/specty-core";
import { InboxRow } from "../inbox/inbox-row";
import { ReviewItems } from "../review/spec-sections";
import { ChangesStore, DERIVER } from "./changes-store";
import type { FinishedQuery } from "./finished-pages";
import { type ChangeRecord, type ChangeView, SpectyData } from "./records";
import type { FinishedPage, FinishedRequest } from "./source";
import { deriveViews } from "./views";

const QUERY: FinishedQuery = { query: "", phase: "all", sort: "waiting", lang: "es" };
const NOW = Date.parse("2026-11-06T12:00:00.000Z");

const OPEN_EPIC = "20261101-panel-academico";
const SLICE = "20261102-asistencia-por-curso";
const DONE_EPIC = "20261020-boletines";
const DONE_SLICE = "20261021-boletin-en-pdf";
const CANCELLED = "20261022-chat-docentes";

/** A change `id`, of `kind`, in `phase`, with `spec`, its tasks done and its start and end. */
function record(
  id: string,
  kind: ChangeState["kind"],
  phase: ChangeState["phase"],
  spec: string,
  times: { readonly created: string; readonly since: string },
  done: readonly string[] = [],
): ChangeRecord {
  const finish = phase === "done" ? "change.closed" : "change.cancelled";
  return {
    spec,
    state: {
      schema: 1,
      id,
      kind,
      phase,
      branch: `specty/${id}`,
      revision: 1,
      items: {},
      tasks: Object.fromEntries(
        done.map((task) => [task, { status: "done", attempts: 1, scopeExtra: [] }]),
      ),
      pending: { scopeRequests: [], adjustment: null },
      maxIds: {},
    },
    phaseSince: times.since,
    audit: [
      { ts: times.created, actor: "agent", event: "change.created", data: {} },
      ...(phase === "done" || phase === "cancelled"
        ? [{ ts: times.since, actor: "human" as const, event: finish, data: {} }]
        : []),
    ],
  };
}

const EPIC_SPEC = `---
kind: epic
---

# Panel académico

## Objetivo

El docente sigue la asistencia y las faltas de sus cursos.

## Criterios de aceptación

- AC1: CUANDO el docente abre el panel ENTONCES ve la asistencia de cada curso.
- AC2: CUANDO la familia justifica una falta ENTONCES el docente la ve justificada.

## Cortes

- C1: Asistencia por curso
  - ac: AC1
- C2: Justificar faltas
  - ac: AC2
  - depends: C1
`;

const SLICE_SPEC = `---
kind: standard
epic: ${OPEN_EPIC}
slice: C1
---

# Asistencia de cada curso en el panel

## Objetivo

El docente ve la asistencia de cada curso.

## Criterios de aceptación

- AC1: CUANDO el docente abre el panel ENTONCES ve la asistencia de cada curso.

## Archivos

- crear lib/panel/asistencia.dart — la vista del panel
- modificar lib/cursos/curso.dart — la asistencia de un curso
- crear test/panel/asistencia_test.dart — sus tests

## Tareas

- [x] T1: La asistencia de un curso
  - files: lib/cursos/curso.dart
  - ac: AC1
- [x] T2: El panel la muestra
  - files: lib/panel/asistencia.dart, test/panel/asistencia_test.dart
  - ac: AC1
`;

const DONE_EPIC_SPEC = `---
kind: epic
---

# Boletines

## Objetivo

Cada familia recibe el boletín de su hijo.

## Criterios de aceptación

- AC1: CUANDO termina el trimestre ENTONCES cada familia recibe el boletín en PDF.

## Cortes

- C1: Boletín en PDF
  - ac: AC1
`;

const DONE_SLICE_SPEC = `---
kind: standard
epic: ${DONE_EPIC}
slice: C1
---

# Un PDF por alumno

## Objetivo

Cada boletín sale en un PDF.
`;

const CANCELLED_SPEC = `---
kind: standard
---

# Chat de docentes

## Objetivo

Los docentes hablan entre ellos.
`;

/** The open epic, and four finished changes, the one waiting longest first. */
const RECORDS: readonly ChangeRecord[] = [
  record(OPEN_EPIC, "epic", "implementing", EPIC_SPEC, {
    created: "2026-10-30T09:00:00.000Z",
    since: "2026-10-31T09:00:00.000Z",
  }),
  record(
    SLICE,
    "standard",
    "done",
    SLICE_SPEC,
    { created: "2026-11-02T08:00:00.000Z", since: "2026-11-02T11:30:00.000Z" },
    ["T1", "T2"],
  ),
  record(DONE_EPIC, "epic", "done", DONE_EPIC_SPEC, {
    created: "2026-10-20T08:00:00.000Z",
    since: "2026-11-03T10:00:00.000Z",
  }),
  record(DONE_SLICE, "standard", "done", DONE_SLICE_SPEC, {
    created: "2026-10-21T08:00:00.000Z",
    since: "2026-11-04T10:00:00.000Z",
  }),
  record(CANCELLED, "standard", "cancelled", CANCELLED_SPEC, {
    created: "2026-10-22T08:00:00.000Z",
    since: "2026-11-05T10:00:00.000Z",
  }),
];

const isFinished = (change: { readonly phase: string }) =>
  change.phase === "done" || change.phase === "cancelled";

/** Every change derived at once, as a source that gives them all: each one whole. */
const WHOLE = deriveViews(RECORDS);

function whole(id: string): ChangeView {
  const found = WHOLE.find((view) => view.id === id);
  if (found === undefined) throw new Error(`no change ${id}`);
  return found;
}

/** What the summary of a change carries, taken from its whole view. */
function summaryOf(view: ChangeView) {
  const { id, title, kind, epic, slices, phase, phaseSince, createdAt, closedAt } = view;
  const { size, tasks, tab } = view;
  return {
    id,
    title,
    kind,
    epic,
    slices,
    phase,
    phaseSince,
    createdAt,
    closedAt,
    size,
    tasks,
    tab,
  };
}

/** A source that gives every change in `changes`: it works out the pages as any source does. */
class Everything extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(RECORDS);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** As the local server: the open epic in the list, the finished changes only in their pages. */
class Paging extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(RECORDS.filter((change) => !isFinished(change.state)));
  }

  override finished(request: FinishedRequest): Promise<FinishedPage> {
    return new Everything().finished(request);
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** The store on a source like the local server, with the first page of finished changes loaded. */
async function loaded() {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SpectyData, useValue: new Paging() },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const store = TestBed.inject(ChangesStore);
  await settle();
  await store.pages.ask(QUERY);
  await settle();
  return store;
}

/** Lets the store load and the source answer. */
async function settle(): Promise<void> {
  for (let round = 0; round < 20; round++) {
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve));
  }
}

/** The Inbox row of `change`, by the same clock. */
async function rowOf(change: unknown): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(InboxRow);
  fixture.componentRef.setInput("change", change);
  fixture.componentRef.setInput("now", NOW);
  await fixture.whenStable();
  return fixture.nativeElement;
}

/** The open epic's slices, as its Spec tab shows them, linked among `changes`. */
async function slicesWith(changes: unknown): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(ReviewItems);
  fixture.componentRef.setInput("review", whole(OPEN_EPIC).review);
  fixture.componentRef.setInput("section", "slices");
  fixture.componentRef.setInput("epic", OPEN_EPIC);
  fixture.componentRef.setInput("changes", changes);
  await fixture.whenStable();
  return fixture.nativeElement;
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("the summary the store keeps of each finished change", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: keeps of each finished change of a page only its summary, its epic's and slice's titles too", async () => {
    const store = await loaded();
    // A slice takes its titles from its epic: the open one, or the summary of a finished one.
    expect(store.finished().map((summary) => summary.epic)).toEqual([
      { id: OPEN_EPIC, title: "Panel académico", slice: "C1", sliceTitle: "Asistencia por curso" },
      undefined,
      { id: DONE_EPIC, title: "Boletines", slice: "C1", sliceTitle: "Boletín en PDF" },
      undefined,
    ]);
    // The open changes stay whole, and every change loaded is there once.
    expect(store.open()).toEqual([whole(OPEN_EPIC)]);
    expect(store.all().map((change) => change.id)).toEqual([
      OPEN_EPIC,
      SLICE,
      DONE_EPIC,
      DONE_SLICE,
      CANCELLED,
    ]);
    // Of each finished change, its summary and nothing else.
    const finished = [SLICE, DONE_EPIC, DONE_SLICE, CANCELLED].map((id) => summaryOf(whole(id)));
    expect(store.finished()).toEqual(finished);
    for (const summary of store.finished()) {
      expect(summary).not.toHaveProperty("review");
      expect(summary).not.toHaveProperty("progress");
      expect(summary).not.toHaveProperty("history");
    }
  });

  it("AC3: shows the row of a finished change of a page as it does with the whole change", async () => {
    const store = await loaded();
    const kept = (id: string) => store.finished().find((summary) => summary.id === id);
    for (const id of [SLICE, DONE_EPIC, DONE_SLICE, CANCELLED]) {
      const summary = await rowOf(kept(id));
      const full = await rowOf(whole(id));
      expect([id, text(summary)]).toEqual([id, text(full)]);
      expect(summary.querySelector("a")?.getAttribute("href")).toBe(`/changes/${id}?tab=history`);
    }
    const slice = await rowOf(kept(SLICE));
    expect(slice.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    expect(text(slice.querySelector("[data-started]"))).toMatch(/^Empezó el /);
    expect(text(slice.querySelector("[data-took]"))).toBe("Tardó 3 h 30 min");
    expect(text(slice.querySelector("[data-waits]"))).toBe("M · 3 archivos · 2 módulos");
    expect(text(slice.querySelector("sp-kind-badge"))).toBe("Feature · C1 · Panel académico");
  });

  it("AC4: links the open epic's slice to the finished change of a page, with its phase", async () => {
    const store = await loaded();
    const kept = await slicesWith(store.all());
    const full = await slicesWith(WHOLE);
    const row = (element: HTMLElement) => element.querySelector("[data-item=C1]");
    expect(row(kept)?.querySelector("a")?.getAttribute("href")).toBe(`/changes/${SLICE}`);
    expect(row(kept)?.querySelector("sp-phase-badge")?.getAttribute("data-phase")).toBe("done");
    expect(text(row(kept))).toBe(text(row(full)));
    // C2 has no change yet: no link.
    expect(kept.querySelector("[data-item=C2] a")).toBeNull();
  });
});
