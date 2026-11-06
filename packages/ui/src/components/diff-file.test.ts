// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type DiffFile, parseDiff } from "../data/diff";
import { sampleDiff } from "../data/sample-diffs";
import { type FileColors, HIGHLIGHT, type Highlight, highlightFile } from "../highlight/highlight";
import { countsLabel, DiffFileView, type DiffMode, firstLines, pathParts } from "./diff-file";

const [, sample] = parseDiff(sampleDiff("20261018-asistencia-curso", "T1"));
if (sample === undefined) throw new Error("No sample file");
const REPOSITORY_TEST: DiffFile = sample;

// How a line is cut into pieces (`spansOf`) is tested with the highlighting, in highlight.test.ts.
describe("Diff lines", () => {
  it("keeps the first lines across hunks", () => {
    const [file] = parseDiff(sampleDiff("20261018-asistencia-curso", "T1"));
    const { hunks, hidden } = firstLines(file?.hunks ?? [], 10);
    expect(hunks.map((hunk) => hunk.lines.length)).toEqual([7, 3]);
    expect(hidden).toBe(25);
  });

  it("breaks a path only after its slashes", () => {
    expect(pathParts("lib/attendance/panel.dart")).toEqual(["lib/", "attendance/", "panel.dart"]);
    expect(pathParts("README.md")).toEqual(["README.md"]);
  });

  it("counts lines in words", () => {
    expect(countsLabel(1, 0, "es")).toBe("1 añadida, 0 quitadas");
    expect(countsLabel(2, 1, "en")).toBe("2 added, 1 removed");
  });
});

@Component({
  imports: [DiffFileView],
  template: `<sp-diff-file [file]="file" [mode]="mode()" />`,
})
class Host {
  readonly file = REPOSITORY_TEST;
  readonly mode = signal<DiffMode>("unified");
}

function render(highlight: Highlight) {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: HIGHLIGHT, useValue: highlight }] });
  const fixture = TestBed.createComponent(Host);
  const element: HTMLElement = fixture.nativeElement;
  /** The pieces of code that have a color, as «text: color». */
  const colored = () =>
    [...element.querySelectorAll<HTMLElement>("[data-code] span:not(.sr-only)")]
      .filter((span) => span.style.color !== "")
      .map((span) => `${span.textContent}: ${span.style.color}`);
  return { fixture, element, colored };
}

describe("Diff file colors", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("colors the code with Shiki, keeping the changed words marked (AC1)", async () => {
    const { fixture, element, colored } = render(highlightFile);
    await fixture.whenStable();
    expect(colored()).toContain("expect: var(--color-code-function)");
    expect(colored()).toContain("'5A': var(--color-code-string)");
    // The changed number keeps its mark and takes its color.
    const changed = [...element.querySelectorAll<HTMLElement>("[data-changed]")];
    expect(changed.map((span) => [span.textContent, span.style.color])).toEqual([
      ["12", "var(--color-code-constant)"],
      ["14", "var(--color-code-constant)"],
    ]);
    expect(changed.every((span) => span.className.includes("bg-diff-"))).toBe(true);
  });

  it("colors both sides when split", async () => {
    const { fixture, colored } = render(highlightFile);
    await fixture.whenStable();
    const tests = () => colored().filter((piece) => piece.startsWith("test:"));
    // A context line and two added ones; side by side, the context line shows twice.
    expect(tests()).toHaveLength(3);
    fixture.componentInstance.mode.set("split");
    await fixture.whenStable();
    expect(tests()).toHaveLength(4);
  });

  it("shows the code plain at once, and in color when it is ready (AC1)", async () => {
    let ready: (colors: FileColors | undefined) => void = () => undefined;
    const { fixture, element, colored } = render(() => new Promise((resolve) => (ready = resolve)));
    fixture.detectChanges();
    expect(element.querySelectorAll("[data-line]").length).toBeGreaterThan(0);
    expect(colored()).toEqual([]);
    ready(await highlightFile(REPOSITORY_TEST));
    await fixture.whenStable();
    expect(colored().length).toBeGreaterThan(0);
  });

  it("stays plain, with no error, when highlighting fails (AC2)", async () => {
    const { fixture, element, colored } = render(() => Promise.reject(new Error("offline")));
    await fixture.whenStable();
    expect(colored()).toEqual([]);
    const removed = element.querySelector("[data-line=removed] [data-code]");
    expect(removed?.textContent).toBe(
      "Quitada:     expect(await repo.recordsFor('5A'), hasLength(12));",
    );
  });
});

const [RLO, LRI, PDI] = [0x202e, 0x2066, 0x2069].map((code) => String.fromCodePoint(code));

/** Whether a text has a character of text direction that the browser would apply. */
const appliesDirection = (text: string) =>
  Array.from(text).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  });

/** A check that reads otherwise than it runs («Trojan Source», CVE-2021-42574). */
const [trojan] = parseDiff(
  [
    "diff --git a/src/access.ts b/src/access.ts",
    "--- a/src/access.ts",
    "+++ b/src/access.ts",
    "@@ -1,3 +1,3 @@",
    " export function canEdit(level: string): boolean {",
    '-  return level === "admin";',
    `+  return level !== "user${RLO} ${LRI}// admin${PDI} ${LRI}";`,
    " }",
  ].join("\n"),
);
if (trojan === undefined) throw new Error("No trojan file");
const TROJAN: DiffFile = trojan;

@Component({
  imports: [DiffFileView],
  template: `<sp-diff-file [file]="file" [mode]="mode()" />`,
})
class TrojanHost {
  readonly file = TROJAN;
  readonly mode = signal<DiffMode>("unified");
}

describe("Diff file, the characters of text direction", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1, AC3: shows each one as its code in the attention tone, with its title, in both modes and keeping the colors", async () => {
    localStorage.setItem("specty.lang", "es");
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: HIGHLIGHT, useValue: highlightFile }],
    });
    const fixture = TestBed.createComponent(TrojanHost);
    const element: HTMLElement = fixture.nativeElement;
    for (const mode of ["unified", "split"] as const) {
      fixture.componentInstance.mode.set(mode);
      await fixture.whenStable();
      const marked = [...element.querySelectorAll<HTMLElement>("[data-code] [data-direction]")];
      expect(marked.map((span) => span.textContent)).toEqual([
        "\\u202e",
        "\\u2066",
        "\\u2069",
        "\\u2066",
      ]);
      for (const span of marked) {
        expect(span.className).toContain("text-phase-review");
        expect(span.className).toContain("bg-phase-review-bg");
        expect(span.style.color).toBe("");
        expect(span.title).toBe(
          "Carácter de dirección del texto: se muestra su código porque podría reordenar lo que lees",
        );
      }
      // The browser applies none, and the code around them keeps its colors.
      expect(appliesDirection(element.textContent ?? "")).toBe(false);
      const pieces = [...element.querySelectorAll<HTMLElement>("[data-code] > span:not(.sr-only)")];
      const first = pieces.findIndex((span) => span.hasAttribute("data-direction"));
      const last = pieces.findLastIndex((span) => span.hasAttribute("data-direction"));
      expect(pieces[first - 1]?.style.color).toBe("var(--color-code-string)");
      expect(pieces[last + 1]?.style.color).toBe("var(--color-code-string)");
      const keywords = pieces.filter((span) => span.textContent?.trim() === "return");
      expect(keywords.map((span) => span.style.color)).toContain("var(--color-code-keyword)");
    }
  });
});
