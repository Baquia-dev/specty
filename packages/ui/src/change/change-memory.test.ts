// SPDX-License-Identifier: Apache-2.0
// The entries of Specty's memory on a change's page: those that came from it and those it took.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import type { MemoryEntry } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeRecord, type MemoryRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** A change of the prototype, in progress, and one that is not. */
const CHANGE = "20261021-login-google";
const OTHER = "20261104-otro-cambio";
const QUIET = "20261020-evolucion-trimestre";

const CLOSED = { at: "2026-11-08T10:00:00.000Z", by: "person" };

const entry = (
  id: string,
  day: number,
  fields: Partial<MemoryEntry> & Pick<MemoryEntry, "origin">,
): MemoryEntry => ({
  id,
  kind: "pending",
  status: "open",
  created: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  text: `Texto de ${id}`,
  ...fields,
});

/** Every status, from the change and taken by it, and two entries of other changes. */
const RECORD: MemoryRecord = {
  entries: [
    entry("P3", 3, {
      origin: { change: CHANGE, by: "claude-code" },
      text: "Primera línea de P3\nSegunda línea que no sale",
    }),
    entry("P5", 1, {
      kind: "improvement",
      status: "taken",
      origin: { change: OTHER, by: "person" },
      taken: { change: CHANGE, at: "2026-11-02T10:00:00.000Z" },
    }),
    entry("P7", 2, {
      kind: "reminder",
      status: "done",
      origin: { change: CHANGE, by: "codex" },
      closed: CLOSED,
    }),
    entry("P8", 4, {
      status: "dropped",
      origin: { change: CHANGE, by: "claude-code" },
      drop: { reason: "Ya no aplica.", by: "person", at: CLOSED.at },
      closed: CLOSED,
    }),
    entry("P9", 5, {
      status: "drop-proposed",
      origin: { change: CHANGE, by: "claude-code" },
      drop: { reason: "Duplica P3.", by: "claude-code", at: CLOSED.at },
    }),
    entry("P11", 6, {
      status: "taken",
      origin: { change: CHANGE, by: "claude-code" },
      taken: { change: OTHER, at: CLOSED.at },
    }),
    entry("D2", 7, {
      kind: "decision",
      origin: { change: CHANGE, by: "person" },
      quote: "así",
    }),
    entry("P12", 8, { origin: { change: OTHER, by: "claude-code" } }),
    entry("P13", 9, {
      status: "done",
      origin: { by: "claude-code" },
      taken: { change: OTHER, at: CLOSED.at },
      closed: CLOSED,
    }),
  ],
  changes: [],
};

/** The rows of `CHANGE`, by date. */
const LISTED = ["P5", "P7", "P3", "P8", "P9", "P11", "D2"];

/** The prototype with the memory above. */
@Injectable()
class WithEntries extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.resolve(RECORD);
  }
}

/** The prototype's changes on a source that does not give the memory. */
@Injectable()
class NoMemory extends SpectyData {
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve(sampleRecords(Date.now()));
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/** A source that cannot read the memory. */
@Injectable()
class Unreadable extends FixtureData {
  override memory(): Promise<MemoryRecord> {
    return Promise.reject(new Error("no se pudo leer"));
  }
}

async function open(url: string, source: new () => SpectyData = WithEntries, lang = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: source },
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
  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
  const section = () => element.querySelector<HTMLElement>("sp-change-page [data-change-memory]");
  const row = (id: string) => section()?.querySelector<HTMLElement>(`[data-entry="${id}"]`);
  const ids = () =>
    [...(section()?.querySelectorAll<HTMLElement>("[data-entry]") ?? [])].map(
      (found) => found.dataset.entry,
    );
  const status = (id: string) => text(row(id)?.querySelector("[data-status]"));
  return { element, settle, section, row, ids, status };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Where a link goes: its path and its query. */
function target(link: HTMLAnchorElement | null | undefined) {
  const url = new URL(link?.getAttribute("href") ?? "", "http://localhost");
  return { path: url.pathname, query: Object.fromEntries(url.searchParams) };
}

describe("the entries of the memory on a change's page", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: lists by date the entries that came from the change and those it took, and no others", async () => {
    const { section, ids } = await open(`/changes/${CHANGE}`);
    expect(text(section()?.querySelector("h2"))).toBe("En la memoria");
    expect(text(section()?.querySelector("[data-meta]"))).toBe(String(LISTED.length));
    expect(ids()).toEqual(LISTED);
    expect(ids()).not.toContain("P12");
    expect(ids()).not.toContain("P13");
  });

  it("AC1: gives each one its id, its kind, its first line, its status and whether it came from the change or the change took it", async () => {
    const { row, status } = await open(`/changes/${CHANGE}`);
    const first = text(row("P3"));
    expect(first).toContain("P3");
    expect(first).toContain("pendiente");
    expect(first).toContain("Primera línea de P3");
    expect(first).not.toContain("Segunda línea que no sale");
    expect(first).toContain("salió de este cambio");
    expect(status("P3")).toBe("abierta");

    expect(text(row("P5"))).toContain("mejora");
    expect(text(row("P5"))).toContain("la tomó este cambio");
    expect(status("P5")).toBe("tomada");

    expect(text(row("P7"))).toContain("recordatorio");
    expect(status("P7")).toBe("hecha");
    expect(status("P8")).toBe("descartada");
    expect(status("P9")).toBe("propuesta para descartar");

    expect(text(row("P11"))).toContain("salió de este cambio");
    expect(text(row("P11"))).toContain(`tomada por ${OTHER}`);
    expect(status("P11")).toBe("tomada");

    expect(text(row("D2"))).toContain("decisión");
    expect(status("D2")).toBe("abierta");
  });

  it("AC2: links each id to the memory with it in the search, and the closed ones in view", async () => {
    const { row } = await open(`/changes/${CHANGE}`);
    const link = (id: string) => row(id)?.querySelector<HTMLAnchorElement>("a");
    expect(text(link("P3"))).toBe("P3");
    expect(target(link("P3"))).toEqual({ path: "/memory", query: { q: "P3" } });
    expect(target(link("P5"))).toEqual({ path: "/memory", query: { q: "P5" } });
    expect(target(link("P7"))).toEqual({ path: "/memory", query: { q: "P7", closed: "1" } });
    expect(target(link("P8"))).toEqual({ path: "/memory", query: { q: "P8", closed: "1" } });
    expect(target(link("P9"))).toEqual({ path: "/memory", query: { q: "P9" } });
  });

  it("AC2: takes the person to the memory with the entry searched and in view, also a done one", async () => {
    const { element, settle, row } = await open(`/changes/${CHANGE}`);
    row("P7")?.querySelector<HTMLAnchorElement>("a")?.click();
    await settle();
    const page = element.querySelector<HTMLElement>("sp-memory-page");
    expect(page).not.toBeNull();
    expect(page?.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("P7");
    expect(page?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
    expect(page?.querySelector('[data-section="closed"] [data-entry="P7"]')).not.toBeNull();
  });

  it("AC4: shows no section on a change with no entries", async () => {
    const { element, section } = await open(`/changes/${QUIET}`);
    expect(element.querySelector("sp-change-page [data-hero] h1")).not.toBeNull();
    expect(section()).toBeNull();
  });

  it("AC4: shows no section when the source does not give the memory or cannot read it", async () => {
    for (const source of [NoMemory, Unreadable]) {
      const { element, section } = await open(`/changes/${CHANGE}`, source);
      expect(element.querySelector("sp-change-page [data-hero] h1")).not.toBeNull();
      expect(section()).toBeNull();
    }
  });

  it("AC5: says the section, the statuses and the relation in English and in Spanish", async () => {
    const english = await open(`/changes/${CHANGE}`, WithEntries, "en");
    expect(text(english.section()?.querySelector("h2"))).toBe("In the memory");
    expect(LISTED.slice(0, 5).map(english.status)).toEqual([
      "taken",
      "done",
      "open",
      "dropped",
      "proposed to drop",
    ]);
    expect(text(english.row("P3"))).toContain("came from this change");
    expect(text(english.row("P3"))).toContain("pending");
    expect(text(english.row("P5"))).toContain("taken by this change");

    const spanish = await open(`/changes/${CHANGE}`, WithEntries, "es");
    expect(text(spanish.section()?.querySelector("h2"))).toBe("En la memoria");
    expect(LISTED.slice(0, 5).map(spanish.status)).toEqual([
      "tomada",
      "hecha",
      "abierta",
      "descartada",
      "propuesta para descartar",
    ]);
    expect(text(spanish.row("P3"))).toContain("salió de este cambio");
    expect(text(spanish.row("P5"))).toContain("la tomó este cambio");
  });
});
