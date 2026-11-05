// SPDX-License-Identifier: Apache-2.0
import { Injectable } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeRecord, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";

/** The sample change whose folder's configuration the server could not read in these tests. */
const UNREAD = sampleRecords(Date.now())[0]?.state.id ?? "";
/** Another sample change, whose configuration the server read. */
const READ = sampleRecords(Date.now())[1]?.state.id ?? "";

/** What the server says of that configuration: a key of a newer Specty, and another error. */
const ISSUES = ['verify: Unrecognized key: "units"', "language: Invalid option"];

/** The sample data, with UNREAD as the server sends it when it cannot read its configuration. */
@Injectable()
class WithUnreadable extends FixtureData {
  override async changes(): Promise<readonly ChangeRecord[]> {
    return (await super.changes()).map((record) =>
      record.state.id === UNREAD ? { ...record, configIssues: ISSUES } : record,
    );
  }
}

async function open(url: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(APP_ROUTES, withComponentInputBinding()),
      { provide: SpectyData, useClass: WithUnreadable },
      {
        provide: DERIVER,
        useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
      },
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  const element: HTMLElement = fixture.nativeElement;
  await TestBed.inject(Router).navigateByUrl(url);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  return element;
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("a change whose folder's configuration the server could not read, in the UI", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC4: carries the «Su configuración no se pudo leer» mark in its Inbox row, and only it", async () => {
    const element = await open("/");
    const rows = [...element.querySelectorAll("sp-inbox-row")];
    const row = rows.find((item) => item.querySelector(`a[href^="/changes/${UNREAD}"]`) !== null);
    expect(row).toBeDefined();
    expect(text(row?.querySelector("[data-config]"))).toBe("Su configuración no se pudo leer");
    expect(rows.filter((item) => item.querySelector("[data-config]") !== null)).toHaveLength(1);
  });

  it("AC5: its page says the configuration could not be read, how to go on, and each issue", async () => {
    const element = await open(`/changes/${UNREAD}`);
    const note = element.querySelector("sp-change-page header [data-config-issues]");
    expect(text(note?.querySelector("[data-config-hint]"))).toBe(
      "No se pudo leer la configuración de su carpeta (.specty/config.yaml). Si la escribió un Specty más nuevo que el de este servidor, reinicia specty ui; si no, corrígela.",
    );
    expect([...(note?.querySelectorAll("[data-config-issue]") ?? [])].map(text)).toEqual(ISSUES);
  });

  it("AC5: the page of a change whose configuration was read has no such note", async () => {
    const element = await open(`/changes/${READ}`);
    expect(element.querySelector("sp-change-page header")).not.toBeNull();
    expect(element.querySelector("[data-config-issues]")).toBeNull();
  });
});
