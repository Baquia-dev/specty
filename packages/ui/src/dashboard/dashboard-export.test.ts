// SPDX-License-Identifier: Apache-2.0
// «Exportar» of the «Panel» page (docs/ui.md): at the end of the filter row, it asks the source
// for the file of the cut in sight, as CSV or JSON, and hands it to the browser; when the source
// does not give it or cannot be read, it says so. In Spanish and in English.
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { type StatsView, statsQuery, statsView } from "@baquia-dev/specty-core";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import type { Download } from "../data/export";
import { FixtureData } from "../data/fixtures";
import { ActionError, type ChangeRecord, SpectyData } from "../data/records";
import { NO_SESSION } from "../data/server-answers";
import type { StatsExportParams } from "../data/server-stats";
import type { StatsParams } from "../data/source";
import { deriveViews } from "../data/views";

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

/** How the source answers: the file, no export, a failure, or no panel at all. */
type Answer = "file" | "none" | "failure" | "no-panel";
let answer: Answer = "file";

/** Every export the page asked for, in order. */
let asked: StatsExportParams[] = [];

/** The prototype, with the panel of each cut and its export. */
@Injectable()
class Served extends FixtureData {
  /** The panel of a cut without changes: the page shows its filters, whatever the panel holds. */
  override stats(params: StatsParams): Promise<StatsView | undefined> {
    if (answer === "no-panel") return Promise.resolve(undefined);
    const query = statsQuery(params);
    return Promise.resolve(statsView({ rows: [], memory: [], today: "2026-11-07", query }));
  }

  override statsExport(params: StatsExportParams): Promise<Download | undefined> {
    asked.push(params);
    if (answer === "failure") return Promise.reject(new ActionError(NO_SESSION));
    if (answer === "none") return Promise.resolve(undefined);
    const csv = params.format === "csv";
    return Promise.resolve({
      name: `specty-stats-2026-11-01-2026-11-07.${params.format}`,
      type: csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      content: csv ? "Cambio,Título\r\n" : '{"changes":[]}\n',
    });
  }
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

const key = (target: Element | null, name: string) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

/** The page at `url`, in `lang`, with a source that answers so, and what the browser saved. */
async function open(url: string, lang: "es" | "en" = "es", how: Answer = "file") {
  answer = how;
  asked = [];
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
      { provide: SpectyData, useClass: Served },
      IN_THREAD,
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

  // What the browser would save: each link's name and the blob behind it.
  const saved: { readonly name: string; readonly blob: Blob | MediaSource | undefined }[] = [];
  const blobs = new Map<string, Blob | MediaSource>();
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    const link = `blob:specty/${blobs.size}`;
    blobs.set(link, blob);
    return link;
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute("href") ?? "") });
  });

  await TestBed.inject(Router).navigateByUrl(url);
  await settle();
  const page = () => element.querySelector<HTMLElement>("sp-dashboard-page");
  const trigger = () =>
    page()?.querySelector<HTMLButtonElement>("[data-filters] [data-export] button") ?? null;
  const items = () => [...document.querySelectorAll<HTMLElement>("[role=menuitem]")];
  /** Opens the menu and chooses its item at `index`. */
  const choose = async (index: number) => {
    trigger()?.focus();
    key(trigger(), "Enter");
    await settle();
    for (let step = 0; step < index; step++) {
      key(document.activeElement, "ArrowDown");
      await settle();
    }
    key(document.activeElement, "Enter");
    await settle();
  };
  const toasts = TestBed.inject(Toasts);
  return {
    page,
    trigger,
    items,
    choose,
    saved,
    settle,
    notices: () => toasts.items().map((toast) => ({ kind: toast.kind, text: toast.text })),
  };
}

async function contentOf(blob: Blob | MediaSource | undefined): Promise<string> {
  return blob instanceof Blob ? blob.text() : "";
}

describe("«Exportar» of the «Panel» page", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("AC1: at the end of the filter row, downloads the CSV of the cut in sight", async () => {
    const { page, trigger, items, choose, saved, settle, notices } = await open(
      "/dashboard?period=7d&who=person%3AAna&kind=quick",
    );
    const filters = page()?.querySelector("[data-filters]");
    expect(filters?.lastElementChild?.hasAttribute("data-export")).toBe(true);
    expect(text(trigger())).toBe("Exportar");
    trigger()?.focus();
    key(trigger(), "Enter");
    await settle();
    expect(items().map((item) => text(item))).toEqual(["CSV", "JSON"]);
    key(document.activeElement, "Escape");
    await settle();

    await choose(0);
    expect(asked).toEqual([
      { period: "7d", who: "person:Ana", kind: "quick", format: "csv", lang: "es" },
    ]);
    expect(saved.map((file) => file.name)).toEqual(["specty-stats-2026-11-01-2026-11-07.csv"]);
    expect(await contentOf(saved[0]?.blob)).toBe("Cambio,Título\r\n");
    expect(notices()).toEqual([]);
  });

  it("AC3: downloads the JSON of the cut in sight", async () => {
    const { choose, saved } = await open("/dashboard");
    await choose(1);
    expect(asked).toEqual([{ period: "30d", format: "json", lang: "es" }]);
    expect(saved.map((file) => file.name)).toEqual(["specty-stats-2026-11-01-2026-11-07.json"]);
    expect(await contentOf(saved[0]?.blob)).toBe('{"changes":[]}\n');
  });

  it("AC5: says so and downloads nothing when the source does not give the export", async () => {
    const { choose, saved, notices } = await open("/dashboard", "es", "none");
    await choose(0);
    expect(asked).toHaveLength(1);
    expect(saved).toEqual([]);
    expect(notices()).toEqual([
      { kind: "error", text: "Esta fuente no da la exportación del panel." },
    ]);
  });

  it("AC5: says why and downloads nothing when the source cannot be read", async () => {
    const { choose, saved, notices } = await open("/dashboard", "es", "failure");
    await choose(0);
    expect(saved).toEqual([]);
    expect(notices()).toEqual([
      { kind: "error", text: `No se pudo exportar el panel. ${NO_SESSION.es}` },
    ]);
  });

  it("AC5: is not in the filter row when the source does not give the panel", async () => {
    const { page, trigger } = await open("/dashboard", "es", "no-panel");
    expect(page()?.querySelector("[data-filters]")).not.toBeNull();
    expect(trigger()).toBeNull();
  });

  it("AC6: says it all in English when the UI is in English", async () => {
    const failing = await open("/dashboard", "en", "failure");
    expect(text(failing.trigger())).toBe("Export");
    await failing.choose(0);
    expect(asked).toEqual([{ period: "30d", format: "csv", lang: "en" }]);
    expect(failing.notices()).toEqual([
      { kind: "error", text: `Could not export the dashboard. ${NO_SESSION.en}` },
    ]);

    const none = await open("/dashboard", "en", "none");
    await none.choose(1);
    expect(asked).toEqual([{ period: "30d", format: "json", lang: "en" }]);
    expect(none.notices()).toEqual([
      { kind: "error", text: "This source does not export the dashboard." },
    ]);
  });
});
