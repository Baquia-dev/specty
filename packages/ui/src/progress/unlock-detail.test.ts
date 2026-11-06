// SPDX-License-Identifier: Apache-2.0
import { TestBed } from "@angular/core/testing";
import type { UnlockEvidence } from "@baquia-dev/specty-core";
import { HIGHLIGHT, highlightFile } from "../highlight/highlight";
import { UnlockDetail } from "./unlock-detail";

const [RLO, LRI, PDI] = [0x202e, 0x2066, 0x2069].map((code) => String.fromCodePoint(code));

/** A check that reads otherwise than it runs («Trojan Source», CVE-2021-42574). */
const HIDDEN = `"user${RLO} ${LRI}// admin${PDI} ${LRI}"`;

/** An unlock's patch whose added line hides what it checks behind characters of text direction. */
const PATCH = [
  "--- a/test/access.test.ts",
  "+++ b/test/access.test.ts",
  "@@ -1,3 +1,3 @@",
  ' it("AC1: only an admin edits", () => {',
  '-  expect(canEdit("user")).toBe(false);',
  `+  expect(canEdit(${HIDDEN})).toBe(false);`,
  " });",
  "",
].join("\n");

const EVIDENCE: readonly UnlockEvidence[] = [
  {
    path: "src/access.ts",
    from: 2,
    to: 3,
    text: `  const user = ${HIDDEN};\n  return level !== user;\n`,
  },
];

const MARKED = ["\\u202e", "\\u2066", "\\u2069", "\\u2066"];

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

async function render(lang: "es" | "en" = "es") {
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HIGHLIGHT, useValue: highlightFile }] });
  const fixture = TestBed.createComponent(UnlockDetail);
  fixture.componentRef.setInput("patch", PATCH);
  fixture.componentRef.setInput("evidence", EVIDENCE);
  for (let round = 0; round < 10; round++) {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
  }
  const element: HTMLElement = fixture.nativeElement;
  return element;
}

/** The pieces of code of a part of the detail, and those marked as a character of direction. */
function piecesOf(part: Element | null) {
  const pieces = [
    ...(part?.querySelectorAll<HTMLElement>("[data-code] > span:not(.sr-only)") ?? []),
  ];
  return { pieces, marked: pieces.filter((span) => span.hasAttribute("data-direction")) };
}

/** The colors of the pieces just before the first mark and just after the last one. */
function around(pieces: readonly HTMLElement[]): readonly string[] {
  const first = pieces.findIndex((span) => span.hasAttribute("data-direction"));
  const last = pieces.findLastIndex((span) => span.hasAttribute("data-direction"));
  return [pieces[first - 1]?.style.color ?? "", pieces[last + 1]?.style.color ?? ""];
}

describe("the detail of an unlock, with characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: the patch shows each one as its code in the attention tone, and the rest keeps its colors", async () => {
    const element = await render();
    const { pieces, marked } = piecesOf(element.querySelector("[data-unlock-patch]"));
    expect(marked.map((span) => span.textContent)).toEqual(MARKED);
    for (const span of marked) {
      expect(span.className).toContain("text-phase-review");
      expect(span.className).toContain("bg-phase-review-bg");
      expect(span.style.color).toBe("");
    }
    expect(around(pieces)).toEqual(["var(--color-code-string)", "var(--color-code-string)"]);
    expect(appliesDirection(element.textContent ?? "")).toBe(false);
  });

  it("AC2: each piece of evidence shows them too, numbered as in its file and with its colors", async () => {
    const element = await render();
    const evidence = element.querySelector("[data-evidence]");
    const numbers = [...(evidence?.querySelectorAll("[data-number]") ?? [])];
    expect(numbers.map((number) => number.textContent?.trim())).toEqual(["2", "3"]);
    const { pieces, marked } = piecesOf(evidence);
    expect(marked.map((span) => span.textContent)).toEqual(MARKED);
    for (const span of marked) {
      expect(span.className).toContain("text-phase-review");
      expect(span.className).toContain("bg-phase-review-bg");
      expect(span.style.color).toBe("");
    }
    expect(around(pieces)).toEqual(["var(--color-code-string)", "var(--color-code-string)"]);
    expect(appliesDirection(evidence?.textContent ?? "")).toBe(false);
  });

  it("AC3: the title of each one says what it is, in Spanish and in English", async () => {
    for (const lang of ["es", "en"] as const) {
      const element = await render(lang);
      const titles = [...element.querySelectorAll<HTMLElement>("[data-direction]")].map(
        (span) => span.title,
      );
      expect(titles).toEqual(Array.from({ length: 8 }, () => TITLE[lang]));
    }
  });
});
