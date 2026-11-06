// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { type ChangeState, parseSpec } from "@baquia-dev/specty-core";
import { bubble, hover, render as renderSentence } from "../components/testing/item-host";
import { FixtureData } from "../data/fixtures";
import { type AssumptionView, type DiffPart, type ReviewView, SpectyData } from "../data/records";
import { deriveReview } from "../data/review";
import { AssumptionRow } from "./assumption-row";
import { ReviewItems, WordDiff } from "./spec-sections";

const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const RLI = String.fromCodePoint(0x2067);
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

/** A spec whose criterion, paths, reason, task and risk read otherwise than they are. */
const SPEC = `# Entrar con Google

## Objetivo

Entrar con Google.

## Criterios de aceptación

- AC1: CUANDO alguien pulsa "Entrar${RLO}" ENTONCES entra.

## Archivos

- crear lib/auth/goo${RLO}gle.dart — prove${LRI}edor
- renombrar lib/login/o${PDI}ld.dart -> lib/login/screen.dart — nombre claro

## Tareas

- [ ] T1: Prove${RLO}edor
  - files: lib/auth/goo${RLO}gle.dart
  - ac: AC1

## Riesgos

- R1: Google ${RLI}cambia${PDI} su API.
`;

/** An epic whose slice title reads otherwise than it is. */
const EPIC = `---
kind: epic
---

# Panel académico

## Objetivo

El docente sigue la asistencia de sus cursos en un panel.

## Criterios de aceptación

- AC1: CUANDO el docente abre el panel ENTONCES ve la asistencia de cada curso.

## Cortes

- C1: Asisten${RLO}cia por curso
  - ac: AC1
`;

const STATE: ChangeState = {
  schema: 1,
  id: "20261021-login-google",
  kind: "standard",
  phase: "review",
  revision: 1,
  items: {},
  tasks: { T1: { status: "active", attempts: 1, scopeExtra: [] } },
  pending: { scopeRequests: [], adjustment: null },
  maxIds: {},
};

const REVIEW = deriveReview(parseSpec(SPEC).spec, STATE, []);
const EPIC_REVIEW = deriveReview(
  parseSpec(EPIC).spec,
  { ...STATE, id: "20261101-panel-academico", kind: "epic", tasks: {} },
  [],
);

/** A sentence the review compares word by word: kept, added and removed words. */
const PARTS: readonly DiffPart[] = [
  { text: `Dice ${RLO}que ` },
  { text: `entra${PDI}`, change: "added" },
  { text: `sale${LRI}`, change: "removed" },
];

@Component({
  imports: [AssumptionRow, ReviewItems, WordDiff],
  template: `
    <div role="list">
      <sp-assumption-row id="assumption" change="20261021-login-google" [assumption]="assumption()" />
    </div>
    @for (section of sections; track section) {
      <sp-review-items [attr.id]="section" [review]="review()" [section]="section" />
    }
    <sp-review-items id="slices" [review]="epic()" [section]="'slices'" />
    <p id="words"><sp-word-diff [parts]="parts()" /></p>
  `,
})
class Host {
  readonly assumption = signal<AssumptionView>({
    id: "A1",
    text: `Existe el ${RLO}proyecto${PDI}.`,
    impact: "high",
    decision: "pending",
  });
  readonly review = signal<ReviewView>(REVIEW);
  readonly epic = signal<ReviewView>(EPIC_REVIEW);
  readonly parts = signal<readonly DiffPart[]>(PARTS);
  readonly sections = ["criteria", "files", "tasks", "risks"] as const;
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SpectyData, useClass: FixtureData }],
  });
  const fixture = TestBed.createComponent(Host);
  for (let round = 0; round < 5; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
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

describe("the Spec tab, with characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: criteria, paths and their reasons, tasks, slices and risks show each one as its code, in the attention tone", async () => {
    const { element } = await render();
    const criterion = element.querySelector("#criteria [data-item=AC1]");
    expectMarked(criterion, [RLO]);
    expect(criterion?.textContent).toContain(
      `CUANDO alguien pulsa "Entrar${codeOf(RLO)}" ENTONCES`,
    );
    const files = element.querySelector("#files");
    expectMarked(files, [RLO, LRI, PDI]);
    expect(files?.textContent).toContain(`lib/auth/goo${codeOf(RLO)}gle.dart`);
    expect(files?.textContent).toContain(`— prove${codeOf(LRI)}edor`);
    expect(files?.textContent).toContain(
      `lib/login/o${codeOf(PDI)}ld.dart → lib/login/screen.dart`,
    );
    const task = element.querySelector("#tasks [data-item=T1]");
    expectMarked(task, [RLO, RLO]);
    expect(task?.querySelector("p")?.textContent).toBe(`Prove${codeOf(RLO)}edor`);
    expectMarked(element.querySelector("#slices [data-item=C1]"), [RLO]);
    expectMarked(element.querySelector("#risks [data-item=R1]"), [RLI, PDI]);
  });

  it("AC2: an assumption and a text compared word by word show them too, with the words that changed", async () => {
    const { element, fixture, host } = await render();
    const assumption = element.querySelector("#assumption");
    expectMarked(assumption, [RLO, PDI]);
    expect(assumption?.querySelector("p")?.textContent).toBe(
      `Existe el ${codeOf(RLO)}proyecto${codeOf(PDI)}.`,
    );
    const words = element.querySelector("#words");
    expectMarked(words, [RLO, PDI, LRI]);
    expect(words?.querySelector("ins [data-direction]")?.textContent).toBe(codeOf(PDI));
    expect(words?.querySelector("del [data-direction]")?.textContent).toBe(codeOf(LRI));

    // A new text with none leaves no mark.
    host.assumption.set({ ...host.assumption(), text: "Existe el proyecto." });
    await fixture.whenStable();
    expect(marksOf(assumption)).toEqual([]);
  });

  it("AC3: a text that names items marks them, and each id still points at its item", async () => {
    const { element, host, settle } = await renderSentence("es");
    host.sentence.set(`Sobre A1${RLO}: afecta a T1 y AC1${PDI}.`);
    await settle();
    const sentence = element.querySelector("#sentence");
    expectMarked(sentence, [RLO, PDI]);
    expect(sentence?.textContent).toBe(`Sobre A1${codeOf(RLO)}: afecta a T1 y AC1${codeOf(PDI)}.`);
    const refs = [...(sentence?.querySelectorAll<HTMLElement>("[data-item-ref]") ?? [])];
    expect(refs.map((ref) => ref.dataset.itemRef)).toEqual(["A1", "T1", "AC1"]);
    hover(refs[1]);
    await settle();
    expect(bubble()?.textContent).toContain("Tarea T1:");
  });

  it("AC6: the title of each one says what it is, in Spanish and in English", async () => {
    for (const lang of ["es", "en"] as const) {
      const { element } = await render(lang);
      const titles = marksOf(element).map((mark) => mark.title);
      expect(titles).toEqual(Array.from({ length: 14 }, () => TITLE[lang]));
    }
    const { element, host, settle } = await renderSentence("en");
    host.sentence.set(`About A1${RLO}.`);
    await settle();
    expect(marksOf(element.querySelector("#sentence")).map((mark) => mark.title)).toEqual([
      TITLE.en,
    ]);
  });

  it("AC7: a text with none, though right to left or with a direction mark, shows as before", async () => {
    const { element, fixture, host } = await render();
    const plain = `Dice «שלום${RLM}» y entra.`;
    host.assumption.set({ ...host.assumption(), text: plain });
    host.review.set({
      ...REVIEW,
      criteria: REVIEW.criteria.map((criterion) => ({ ...criterion, text: plain })),
    });
    host.parts.set([{ text: plain }]);
    await fixture.whenStable();
    expect(marksOf(element.querySelector("#assumption"))).toEqual([]);
    expect(element.querySelector("#assumption p")?.textContent).toBe(plain);
    expect(marksOf(element.querySelector("#criteria"))).toEqual([]);
    expect(element.querySelector("#criteria [data-item=AC1] p")?.textContent).toBe(plain);
    expect(element.querySelector("#words")?.textContent).toBe(plain);
  });
});
