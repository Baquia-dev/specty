// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { parseDiff } from "../data/diff";
import { HIGHLIGHT } from "../highlight/highlight";
import { DiffFileView, type DiffMode } from "./diff-file";

/**
 * A long file: its task rewrote line 2 and added a line at 70, past what a long file shows
 * before «Mostrar N líneas más».
 */
const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,70 +1,71 @@",
  " l1",
  "-l2",
  "+l2 nueva",
  ...Array.from({ length: 67 }, (_, index) => ` l${index + 3}`),
  "+l70 nueva",
  " l70",
  "",
].join("\n");

const [FILE] = parseDiff(DIFF);

@Component({
  imports: [DiffFileView],
  template: `@if (file; as file) {<sp-diff-file [file]="file" [mode]="mode()" [marked]="marked()" />}`,
})
class Host {
  readonly file = FILE;
  readonly mode = signal<DiffMode>("unified");
  readonly marked = signal<readonly number[]>([]);
}

async function render(marked: readonly number[], mode: DiffMode = "unified") {
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) }],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.marked.set(marked);
  fixture.componentInstance.mode.set(mode);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const text = (node: Element | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const marks = () => [...element.querySelectorAll<HTMLElement>("[data-marked]")];
  return { element, text, marks };
}

describe("lines marked in a diff file", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC2: marks the new side's lines it is given, never a removed one, and shows the whole file", async () => {
    const { element, text, marks } = await render([2, 70]);
    expect(marks().map((row) => text(row))).toEqual([
      expect.stringContaining("l2 nueva"),
      expect.stringContaining("l70 nueva"),
    ]);
    expect(marks().some((row) => row.getAttribute("data-line") === "removed")).toBe(false);
    expect(element.querySelector("[data-more]")).toBeNull();

    const context = await render([3]);
    expect(context.marks().map((row) => context.text(row))).toEqual([
      expect.stringContaining("l3"),
    ]);
  });

  it("AC2: marks nothing and keeps the preview of a long file without lines to mark", async () => {
    const { element, marks } = await render([]);
    expect(marks()).toEqual([]);
    expect(element.querySelector("[data-more]")).not.toBeNull();
  });

  it("AC2: marks the new side's line side by side too", async () => {
    const { text, marks } = await render([2], "split");
    expect(marks()).toHaveLength(1);
    expect(text(marks()[0])).toContain("l2 nueva");
  });
});
