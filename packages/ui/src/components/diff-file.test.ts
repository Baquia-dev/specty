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
