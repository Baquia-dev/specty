// SPDX-License-Identifier: Apache-2.0
// The Inbox with the finished changes in pages: the first one at first, the next one at the end of
// the list, with «Cargar más» or with j, and the counts as the source gives them.
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { sortChanges } from "@baquia-dev/specty-core/light";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { sampleRecords } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import type { FinishedPage, FinishedRequest } from "../data/source";
import { deriveViews } from "../data/views";
import { InboxState } from "./inbox-state";
import { INBOX_GROUPS, INBOX_SORTS, inboxSections, stateOf } from "./inbox-view";

const START = Date.parse("2026-10-01T08:00:00.000Z");
const SAMPLES = sampleRecords(Date.now());
const isFinished = (record: ChangeRecord) =>
  record.state.phase === "done" || record.state.phase === "cancelled";
/** The eight open changes of the sample project: six decisions and two in progress. */
const OPEN = SAMPLES.filter((record) => !isFinished(record));
const BASE = SAMPLES.find(isFinished) ?? fail();

/** The finished change number `n`: every tenth one cancelled, each one minute after the last. */
function archived(n: number): ChangeRecord {
  const nn = String(n).padStart(2, "0");
  const id = `20261001-archivado-${nn}`;
  return {
    ...BASE,
    spec: `---\nkind: standard\n---\n\n# Archivado ${nn}\n\n## Objetivo\n\nUn cambio terminado.\n`,
    state: {
      ...BASE.state,
      id,
      kind: "standard",
      phase: n % 10 === 0 ? "cancelled" : "done",
      branch: `specty/${id}`,
    },
    phaseSince: new Date(START + n * 60_000).toISOString(),
  };
}

/** Seventy finished changes, the first one waiting longest: 63 done and 7 cancelled. */
const ARCHIVED = Array.from({ length: 70 }, (_, index) => archived(index + 1));

/**
 * A source that gives every change in `changes`, as `/api/changes` does before C6, and pages the
 * finished ones as any source does by default, noting each page it is asked for.
 */
class Archive extends SpectyData {
  open: readonly ChangeRecord[] = OPEN;
  archived: readonly ChangeRecord[] = ARCHIVED;
  readonly asked: FinishedRequest[] = [];
  private readonly listeners = new Set<() => void>();

  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([...this.open, ...this.archived]);
  }

  override finished(request: FinishedRequest): Promise<FinishedPage> {
    this.asked.push(request);
    return super.finished(request);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Says something changed, as the local server's events do. */
  tell(): void {
    for (const listener of this.listeners) listener();
  }
}

/** jsdom has no IntersectionObserver: this one reports only when the test shows an element. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly targets: Element[] = [];

  constructor(private readonly report: (entries: readonly IntersectionObserverEntry[]) => void) {
    FakeObserver.all.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  unobserve(target: Element): void {
    this.targets.splice(this.targets.indexOf(target), 1);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** What watches `element`, or inside it, sees it come into view. */
  static show(element: Element | null): void {
    for (const observer of FakeObserver.all) {
      const seen = observer.targets.filter((target) => element?.contains(target));
      if (seen.length === 0) continue;
      observer.report(
        seen.map(
          (target) =>
            ({
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            }) as IntersectionObserverEntry,
        ),
      );
    }
  }
}

/** The Inbox on the archive, grouped, sorted and in the language given. */
async function open(
  given: { readonly group?: string; readonly sort?: string; readonly lang?: string } = {},
) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  localStorage.clear();
  localStorage.setItem("specty.lang", given.lang ?? "es");
  if (given.group !== undefined) localStorage.setItem("specty.inbox.group", given.group);
  if (given.sort !== undefined) localStorage.setItem("specty.inbox.sort", given.sort);
  const source = new Archive();
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
  const settle = async () => {
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await TestBed.inject(Router).navigateByUrl("/");
  await settle();
  const rows = () => [...element.querySelectorAll<HTMLElement>("sp-inbox sp-inbox-row")];
  const row = (id: string) => rows().find((item) => item.dataset.id === id);
  /** The numbers of the finished rows, in the order they are shown. */
  const finished = () =>
    rows().flatMap((item) => {
      const found = /archivado-(\d+)$/.exec(item.dataset.id ?? "");
      return found?.[1] === undefined ? [] : [found[1]];
    });
  const more = () => element.querySelector("sp-inbox-more");
  const loadMore = async () => {
    more()?.querySelector<HTMLButtonElement>("button")?.click();
    await settle();
  };
  const press = (key: string) =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  const phases = () =>
    [...element.querySelectorAll("sp-inbox-toolbar [data-phases] button")].map(text);
  return { fixture, element, source, settle, rows, row, finished, more, loadMore, press, phases };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => String(from + index).padStart(2, "0"));
const FIRST: FinishedRequest = {
  offset: 0,
  limit: 30,
  query: "",
  phase: "all",
  sort: "waiting",
  lang: "es",
};

describe("Inbox with the finished changes in pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("AC1: shows every open change and only the first page of finished ones, though changes() gives them all", async () => {
    const { element, source, rows, finished } = await open();
    expect(source.asked).toEqual([FIRST]);
    expect(rows()).toHaveLength(8 + 30);
    expect(finished()).toEqual(range(1, 30));
    const sections = [...element.querySelectorAll("sp-inbox section")].map((section) =>
      text(section.querySelector("h2")),
    );
    expect(sections).toEqual(["Esperan tu decisión", "En curso", "Recientes"]);
  });

  it("AC1: puts the open changes before the finished ones, each part in the chosen order", async () => {
    // By title, «Archivado» would go before almost every open change.
    const { source, rows, finished } = await open({ group: "none", sort: "title" });
    expect(source.asked).toEqual([{ ...FIRST, sort: "title" }]);
    const titled = sortChanges(deriveViews(OPEN), "title", "es").map((view) => view.id);
    expect(
      rows()
        .slice(0, 8)
        .map((item) => item.dataset.id),
    ).toEqual(titled);
    expect(finished()).toEqual(range(1, 30));
  });

  it("AC2: asks the next page when the end of the list comes into view, and with «Cargar más», until none are left", async () => {
    const { source, settle, rows, finished, more, loadMore } = await open();
    FakeObserver.show(more());
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, offset: 30 });
    expect(finished()).toEqual(range(1, 60));
    await loadMore();
    expect(source.asked.map((request) => request.offset)).toEqual([0, 30, 60]);
    expect(finished()).toEqual(range(1, 70));
    expect(more()).toBeNull();
    const ids = rows().map((item) => item.dataset.id);
    expect([ids.length, new Set(ids).size]).toEqual([78, 78]);
  });

  it("AC2: does not repeat a change that moved from one page to the next", async () => {
    const { source, finished, loadMore } = await open();
    // Archived meanwhile, first in the order: the 30th moves to the second page.
    source.archived = [archived(0), ...ARCHIVED];
    await loadMore();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, offset: 30 });
    expect(finished()).toEqual(range(1, 59));
  });

  it("AC2: j on the last row loaded asks the next page and moves to the first new row", async () => {
    const { fixture, source, settle, rows, row, press } = await open();
    for (let step = 0; step < 37; step++) press("j");
    await fixture.whenStable();
    expect(rows().at(-1)?.dataset.id).toBe("20261001-archivado-30");
    expect(rows().at(-1)?.getAttribute("aria-current")).toBe("true");
    expect(source.asked).toHaveLength(1);
    press("j");
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, offset: 30 });
    expect(rows()).toHaveLength(8 + 60);
    expect(row("20261001-archivado-31")?.getAttribute("aria-current")).toBe("true");
  });

  it("AC3: counts every finished change the source counts, not only the ones loaded", async () => {
    const { element, phases } = await open();
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "6 decisiones · 2 en curso · 70 recientes",
    );
    expect(phases()).toContain("Todas 78");
    expect(phases()).toContain("Terminado 63");
    expect(phases()).toContain("Cancelado 7");
  });

  it("AC3: a search asks from the first page once typing stops for 250 ms, and counts what the source finds", async () => {
    const { element, source, settle, rows, finished, phases } = await open();
    const input = element.querySelector<HTMLInputElement>("sp-inbox-toolbar input");
    if (input === null) throw new Error("no search");
    for (const typed of ["a", "ar", "archivado 1"]) {
      input.value = typed;
      input.dispatchEvent(new Event("input"));
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(source.asked).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle();
    expect(source.asked.slice(1)).toEqual([{ ...FIRST, query: "archivado 1" }]);
    expect(finished()).toEqual(range(10, 19));
    expect(rows()).toHaveLength(10);
    expect(text(element.querySelector("[data-shown]"))).toContain("10 de 78 cambios");
    expect(phases()).toEqual(["Todas 10", "Terminado 9", "Cancelado 1"]);
    // The summary counts every change, whatever the search.
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "6 decisiones · 2 en curso · 70 recientes",
    );
  });

  it("AC3: a phase or a sort asks from the first page at once and leaves the pages before", async () => {
    const { element, source, settle, rows, finished, loadMore } = await open();
    await loadMore();
    expect(finished()).toHaveLength(60);
    const cancelled = [...element.querySelectorAll<HTMLButtonElement>("[data-phases] button")].find(
      (button) => text(button).startsWith("Cancelado"),
    );
    cancelled?.click();
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, phase: "cancelled" });
    expect(finished()).toEqual(["10", "20", "30", "40", "50", "60", "70"]);
    expect(rows()).toHaveLength(7);
    expect(text(element.querySelector("[data-shown]"))).toContain("7 de 78 cambios");
    TestBed.inject(InboxState).sort.set("recent");
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, phase: "cancelled", sort: "recent" });
    expect(finished()).toEqual(["70", "60", "50", "40", "30", "20", "10"]);
  });

  it("AC4: a notice reads again the open changes and as many finished as were loaded, keeping the chosen row", async () => {
    const { fixture, source, settle, rows, row, finished, loadMore, press } = await open();
    await loadMore();
    for (let step = 0; step < 40; step++) press("j");
    await fixture.whenStable();
    const chosen = rows()[40]?.dataset.id;
    expect(chosen).toBe("20261001-archivado-33");
    // Meanwhile, a change is archived first in the order and an open one moves on.
    source.archived = [archived(0), ...ARCHIVED];
    source.open = OPEN.map((record) =>
      record.state.id === "20261021-modo-oscuro"
        ? { ...record, state: { ...record.state, phase: "review" } }
        : record,
    );
    source.tell();
    await settle();
    expect(source.asked.at(-1)).toEqual({ ...FIRST, limit: 60 });
    expect(finished()).toEqual(range(0, 59));
    expect(
      row("20261021-modo-oscuro")?.querySelector("sp-phase-badge")?.getAttribute("data-phase"),
    ).toBe("review");
    expect(row(chosen ?? "")?.getAttribute("aria-current")).toBe("true");
  });

  it("AC7: says «Cargar más» in Spanish and «Load more» in English", async () => {
    const spanish = await open();
    expect(text(spanish.more()?.querySelector("button"))).toBe("Cargar más");
    TestBed.resetTestingModule();
    const english = await open({ lang: "en" });
    expect(english.source.asked).toEqual([{ ...FIRST, lang: "en" }]);
    expect(text(english.more()?.querySelector("button"))).toBe("Load more");
  });
});

describe("the open changes before the finished ones", () => {
  it("AC1: puts the open changes first in every grouping and sort, each part in its order", () => {
    const views = deriveViews(SAMPLES);
    const isOpen = (change: (typeof views)[number]) => stateOf(change) !== "recent";
    // Finished titles that sort first: one sort of all the changes would put them first.
    const finished = views
      .filter((change) => !isOpen(change))
      .map((change, index) => ({ ...change, title: `A ${index}` }));
    const open = views.filter(isOpen);
    const all = [...finished, ...open];
    const defaults = { query: "", phase: "all", group: "state", sort: "waiting" } as const;
    for (const group of INBOX_GROUPS) {
      for (const sort of INBOX_SORTS) {
        for (const section of inboxSections(all, { ...defaults, group, sort }, "es")) {
          const opens = section.changes.map(isOpen);
          expect([group, sort, section.key, opens]).toEqual([
            group,
            sort,
            section.key,
            opens.toSorted((a, b) => Number(b) - Number(a)),
          ]);
        }
      }
    }
    const [none] = inboxSections(all, { ...defaults, group: "none", sort: "title" }, "es");
    const ids = (changes: readonly { readonly id: string }[]) => changes.map((change) => change.id);
    expect(ids(none?.changes ?? [])).toEqual([
      ...ids(sortChanges(open, "title", "es")),
      ...ids(sortChanges(finished, "title", "es")),
    ]);
  });
});

function fail(): never {
  throw new Error("missing sample change");
}
