// SPDX-License-Identifier: Apache-2.0
import { Component, Injectable, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter, Router, withComponentInputBinding } from "@angular/router";
import { APP_ROUTES } from "../app/routes";
import { Shell } from "../app/shell";
import { DERIVER } from "../data/changes-store";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeRecord, type ListedChange, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { InboxRow } from "../inbox/inbox-row";

const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const RLM = String.fromCodePoint(0x200f);

/** The code a character of text direction shows as: as the terminal writes it. */
const codeOf = (char: string) => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;

const TITLE = {
  es: "Carácter de dirección del texto: se muestra su código porque podría reordenar lo que lees",
  en: "Text direction character: its code is shown because it could reorder what you read",
};

/** Whether a text has a character of text direction that the browser would apply. */
const appliesDirection = (text: string) =>
  Array.from(text).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  });

const LOGIN = "20261021-login-google";
const EVOLUCION = "20261020-evolucion-trimestre";

/** A title that reads otherwise than it is. */
const HIDDEN_TITLE = `Agrupar la evolución ${RLO}por trimestre`;

function viewOf(id: string) {
  const found = deriveViews(sampleRecords(Date.now())).find((view) => view.id === id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
}

/** A change in the Inbox whose title, shared path and scope request read otherwise than they are. */
function hiddenRow(): ListedChange {
  const other = { id: "20261019-boletines-pdf", title: "Boletines en PDF" };
  return {
    ...viewOf(LOGIN),
    title: HIDDEN_TITLE,
    shared: [{ path: `lib/a${LRI}pp.dart`, changes: [other] }],
    scopeRequests: [
      {
        id: "S1",
        task: "T1",
        paths: [`lib/auth/se${PDI}ssion.dart`],
        reason: `La firma ${RLO}cambió.`,
      },
    ],
  };
}

@Component({
  imports: [InboxRow],
  template: `<sp-inbox-row [change]="change()" />`,
})
class Row {
  readonly change = signal<ListedChange>(hiddenRow());
}

async function renderRow(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Row);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element, fixture, host: fixture.componentInstance };
}

/** The sample data, with the title of «Agrupar la evolución…» hiding a character of direction. */
@Injectable()
class HiddenTitle extends FixtureData {
  override async changes(): Promise<readonly ChangeRecord[]> {
    const records = await super.changes();
    return records.map((record) =>
      record.state.id === EVOLUCION
        ? { ...record, spec: record.spec.replace(/^# .*$/m, `# ${HIDDEN_TITLE}`) }
        : record,
    );
  }
}

/** jsdom has no Worker: derive in the same thread, as the worker would. */
const IN_THREAD = {
  provide: DERIVER,
  useValue: (records: readonly ChangeRecord[]) => Promise.resolve(deriveViews(records)),
};

async function openChange(lang: "es" | "en" = "es") {
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
      { provide: SpectyData, useClass: HiddenTitle },
      IN_THREAD,
    ],
  });
  const fixture = TestBed.createComponent(Shell);
  await TestBed.inject(Router).navigateByUrl(`/changes/${EVOLUCION}`);
  for (let round = 0; round < 40; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const element: HTMLElement = fixture.nativeElement;
  return { element };
}

/** The characters of direction marked under `part`. */
const marksOf = (part: Element | null | undefined) => [
  ...(part?.querySelectorAll<HTMLElement>("[data-direction]") ?? []),
];

/** The marks under `part` show these codes, in the attention tone, and nothing there applies one. */
function expectMarked(part: Element | null | undefined, chars: readonly string[]) {
  const marks = marksOf(part);
  expect(marks.map((mark) => mark.textContent)).toEqual(chars.map(codeOf));
  for (const mark of marks) {
    expect(mark.className).toContain("text-phase-review");
    expect(mark.className).toContain("bg-phase-review-bg");
  }
  expect(appliesDirection(part?.textContent ?? "")).toBe(false);
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("the Inbox and the change's header, with characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC4: a scope request in the Inbox shows each one of its paths and its reason as its code, in the attention tone", async () => {
    const { element } = await renderRow();
    const notes = [...element.querySelectorAll("[data-note]")];
    const request = notes.find((note) => text(note).startsWith("T1 pide"));
    expectMarked(request, [PDI, RLO]);
    expect(text(request)).toBe(
      `T1 pide lib/auth/se${codeOf(PDI)}ssion.dart: «La firma ${codeOf(RLO)}cambió.»`,
    );
    const shared = element.querySelector("[data-shared]");
    expectMarked(shared, [LRI]);
    expect(text(shared)).toContain(`Comparte lib/a${codeOf(LRI)}pp.dart con`);
  });

  it("AC5: the title of a change shows them in the Inbox", async () => {
    const { element } = await renderRow();
    const title = element.querySelector("a");
    expectMarked(title, [RLO]);
    expect(text(title)).toBe(`Agrupar la evolución ${codeOf(RLO)}por trimestre`);
    expect(appliesDirection(element.textContent ?? "")).toBe(false);
  });

  it("AC5: the title of a change shows them in its header and in its compact bar", async () => {
    const { element } = await openChange();
    const heading = element.querySelector("sp-change-page h1");
    expectMarked(heading, [RLO]);
    expect(text(heading)).toBe(`Agrupar la evolución ${codeOf(RLO)}por trimestre`);
    const bar = element.querySelector("sp-change-page [data-sticky] [data-heading] p");
    expectMarked(bar, [RLO]);
    expect(text(bar)).toBe(`Agrupar la evolución ${codeOf(RLO)}por trimestre`);
  });

  it("AC6: the title of each one says what it is, in Spanish and in English", async () => {
    for (const lang of ["es", "en"] as const) {
      const { element } = await renderRow(lang);
      const titles = marksOf(element).map((mark) => mark.title);
      expect(titles).toEqual(Array.from({ length: 4 }, () => TITLE[lang]));
    }
    const { element } = await openChange("en");
    expect(marksOf(element.querySelector("sp-change-page h1")).map((mark) => mark.title)).toEqual([
      TITLE.en,
    ]);
  });

  it("AC7: a title and a request with none, though right to left or with a direction mark, show as before", async () => {
    const { element, fixture, host } = await renderRow();
    const plain = `Dice «שלום${RLM}»`;
    host.change.set({
      ...hiddenRow(),
      title: plain,
      shared: [],
      scopeRequests: [{ id: "S1", task: "T1", paths: ["lib/app.dart"], reason: plain }],
    });
    await fixture.whenStable();
    expect(marksOf(element)).toEqual([]);
    expect(text(element.querySelector("a"))).toBe(plain);
  });
});
