// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { Toasts } from "../components/toast";
import { DERIVER } from "../data/changes-store";
import { FixtureData } from "../data/fixtures";
import type { ChangeRecord } from "../data/records";
import { sampleRecords } from "../data/sample-records";
import { SpectyData } from "../data/source";
import { deriveViews } from "../data/views";
import { HistoryExport } from "./history-export";

const ID = "20261015-redondeo-promedios";

/** A source with the sample changes, or none, or one that cannot be read. */
class Source extends SpectyData {
  records: readonly ChangeRecord[] = sampleRecords(Date.now());
  failure: Error | undefined;

  override changes(): Promise<readonly ChangeRecord[]> {
    return this.failure === undefined
      ? Promise.resolve(this.records)
      : Promise.reject(this.failure);
  }

  override subscribe(): () => void {
    return () => undefined;
  }
}

@Component({
  imports: [HistoryExport],
  template: `<sp-history-export [change]="id" />`,
})
class Host {
  readonly id = ID;
}

function quiet(): void {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
}

const key = (target: Element | null, name: string) =>
  target?.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

async function render(setUp: (source: Source) => void = () => undefined) {
  quiet();
  TestBed.resetTestingModule();
  const source = new Source();
  setUp(source);
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useValue: source }] });
  const fixture = TestBed.createComponent(Host);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();

  // What the browser would save: each link's name and the blob behind it.
  const saved: { readonly name: string; readonly blob: Blob | MediaSource | undefined }[] = [];
  const blobs = new Map<string, Blob | MediaSource>();
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    const url = `blob:specty/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute("href") ?? "") });
  });

  const element: HTMLElement = fixture.nativeElement;
  const trigger = () => element.querySelector<HTMLButtonElement>("sp-history-export button");
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
  return { trigger, items, choose, saved, settle, toasts: TestBed.inject(Toasts) };
}

async function text(blob: Blob | MediaSource | undefined): Promise<string> {
  return blob instanceof Blob ? blob.text() : "";
}

describe("the export of the History tab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it("AC1: downloads `specty audit`'s report as Markdown or JSON", async () => {
    const { trigger, items, choose, saved, settle } = await render();
    expect(trigger()?.textContent).toContain("Exportar");
    trigger()?.focus();
    key(trigger(), "Enter");
    await settle();
    expect(items().map((item) => item.textContent?.trim())).toEqual([
      "Markdown",
      "JSON",
      "OpenSpec",
      "Spec Kit",
      "Kiro",
    ]);
    key(document.activeElement, "Escape");
    await settle();

    await choose(0);
    expect(saved.map((file) => file.name)).toEqual([`${ID}.md`]);
    expect(await text(saved[0]?.blob)).toContain("# Auditoría: ");

    await choose(1);
    expect(saved[1]?.name).toBe(`${ID}.json`);
    expect(JSON.parse(await text(saved[1]?.blob))).toMatchObject({ change: { id: ID } });
  });

  it("AC2: downloads OpenSpec, Spec Kit and Kiro as a zip", async () => {
    const { choose, saved } = await render();
    await choose(2);
    await choose(3);
    await choose(4);
    expect(saved.map((file) => file.name)).toEqual([
      `${ID}-openspec.zip`,
      `${ID}-speckit.zip`,
      `${ID}-kiro.zip`,
    ]);
    const blob = saved[0]?.blob;
    const bytes = new Uint8Array(blob instanceof Blob ? await blob.arrayBuffer() : []);
    // A zip starts with a local file header: `PK\x03\x04`.
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("AC3: says so and downloads nothing when the source no longer has the change", async () => {
    const { choose, saved, toasts } = await render((source) => {
      source.records = [];
    });
    await choose(0);
    expect(saved).toEqual([]);
    expect(toasts.items().map((toast) => toast.kind)).toEqual(["error"]);
  });

  it("AC3: says so and downloads nothing when the source cannot be read", async () => {
    const { choose, saved, toasts } = await render((source) => {
      source.failure = new Error("offline");
    });
    await choose(0);
    expect(saved).toEqual([]);
    expect(toasts.items().map((toast) => toast.kind)).toEqual(["error"]);
  });

  it("AC1: is in the History tab of a change's page", async () => {
    quiet();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        { provide: SpectyData, useClass: FixtureData },
        {
          provide: DERIVER,
          useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
        },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    await TestBed.inject(Router).navigateByUrl(`/changes/${ID}?tab=history`);
    for (let round = 0; round < 40; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector("sp-history-tab sp-history-export button")?.textContent).toContain(
      "Exportar",
    );
  });
});
