// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData } from "../data/fixtures";
import type { TaskProgressView, TaskScopeRequest } from "../data/progress";
import { SpectyData } from "../data/records";
import { ScopeRequest } from "./scope-request";
import { TaskRow } from "./task-row";

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

/** A request whose path and reason read otherwise than they are. */
const REQUEST: TaskScopeRequest = {
  id: "S1",
  paths: [`lib/a${RLO}pp.dart`, "lib/auth/session.dart"],
  reason: `La firma ${LRI}cambió${PDI} en ${RLO}main.`,
};

/** A done task whose title, summary and path read otherwise than they are. */
const TASK: TaskProgressView = {
  id: "T1",
  title: `Prove${RLO}edor`,
  status: "done",
  summary: `Hecho ${LRI}así${PDI}.`,
  files: [`lib/auth/goo${RLO}gle.dart`],
  criteria: ["AC1"],
  attempts: 1,
  scopeRequests: [],
};

@Component({
  imports: [ScopeRequest, TaskRow],
  template: `
    <sp-scope-request id="request" change="20261021-login-google" task="T1" [request]="request()" />
    <div role="list"><sp-task-row id="task" [task]="task()" /></div>
  `,
})
class Host {
  readonly request = signal<TaskScopeRequest>(REQUEST);
  readonly task = signal<TaskProgressView>(TASK);
}

async function render(lang: "es" | "en" = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { element, fixture, host: fixture.componentInstance };
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

describe("Progress, with characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC4: a scope request shows each one of its paths and its reason as its code, in the attention tone", async () => {
    const { element } = await render();
    const request = element.querySelector("#request");
    expectMarked(request, [RLO, LRI, PDI, RLO]);
    const paths = [...(request?.querySelectorAll("code") ?? [])].map(text);
    expect(paths).toEqual([`lib/a${codeOf(RLO)}pp.dart`, "lib/auth/session.dart"]);
    expect(text(request)).toContain(
      `: «La firma ${codeOf(LRI)}cambió${codeOf(PDI)} en ${codeOf(RLO)}main.»`,
    );
    expect(request?.querySelector("code [data-direction]")?.textContent).toBe(codeOf(RLO));
  });

  it("AC4: a task shows them in its title, its summary and its paths", async () => {
    const { element } = await render();
    const task = element.querySelector("#task");
    expectMarked(task, [RLO, LRI, PDI, RLO]);
    expect(text(task)).toContain(`Prove${codeOf(RLO)}edor`);
    expect(text(task?.querySelector("[data-summary]"))).toBe(
      `Hecho ${codeOf(LRI)}así${codeOf(PDI)}.`,
    );
    expect(text(task?.querySelector("[data-meta] code"))).toBe(
      `lib/auth/goo${codeOf(RLO)}gle.dart`,
    );
  });

  it("AC6: the title of each one says what it is, in Spanish and in English", async () => {
    for (const lang of ["es", "en"] as const) {
      const { element } = await render(lang);
      const titles = marksOf(element).map((mark) => mark.title);
      expect(titles).toEqual(Array.from({ length: 8 }, () => TITLE[lang]));
    }
  });

  it("AC7: a request and a task with none, though right to left or with a direction mark, show as before", async () => {
    const { element, fixture, host } = await render();
    const plain = `Dice «שלום${RLM}».`;
    host.request.set({ ...REQUEST, paths: ["lib/app.dart"], reason: plain });
    host.task.set({ ...TASK, title: plain, summary: plain, files: ["lib/app.dart"] });
    await fixture.whenStable();
    expect(marksOf(element)).toEqual([]);
    expect(text(element.querySelector("#request"))).toContain(`T1 pide lib/app.dart: «${plain}»`);
    expect(text(element.querySelector("#task [data-summary]"))).toBe(plain);
  });
});
