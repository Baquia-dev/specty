// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { WhyCommit } from "@baquia-dev/specty-core";
import { parseDiff } from "../data/diff";
import { sampleRecords } from "../data/fixtures";
import type { ChangeRecord } from "../data/records";
import { sampleDiff } from "../data/sample-diffs";
import { sampleTrace } from "../data/sample-trace";
import { SpectyData } from "../data/source";
import type { TraceRecord } from "../data/trace";
import { HIGHLIGHT } from "../highlight/highlight";
import { TraceView } from "./trace-view";

const ID = "20261018-asistencia-curso";
const PATH = "lib/attendance/course_panel.dart";

const OURS: WhyCommit = {
  commit: "8b0a4f6",
  date: "2026-10-18",
  author: "Ana Gómez",
  subject: "feat: panel",
  change: { id: ID, task: { id: "T2", title: "Panel con estudiantes destacados" }, criteria: [] },
};

/** The task wrote a header and the class; a later one moved the class from line 2 to line 3. */
const TRACE = {
  path: PATH,
  commit: "9f9f9f9",
  lines: ["import 'a.dart';", "// cabecera", "class Panel {}"],
  blocks: [
    { start: 1, end: 1, commit: { ...OURS, commit: "9f9f9f9" }, origin: [1] },
    { start: 2, end: 3, commit: OURS, origin: [1, 2] },
  ],
} as const;

const TASK_DIFF = [
  `diff --git a/${PATH} b/${PATH}`,
  "new file mode 100644",
  "index 0000000..8b0a4f6",
  "--- /dev/null",
  `+++ b/${PATH}`,
  "@@ -0,0 +1,3 @@",
  "+// cabecera",
  "+class Panel {}",
  "+// del panel",
  "",
].join("\n");

class Source extends SpectyData {
  trace_: TraceRecord = TRACE;

  override changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }

  override subscribe(): () => void {
    return () => undefined;
  }

  override traceFiles(): Promise<readonly string[]> {
    return Promise.resolve([PATH]);
  }

  override trace(): Promise<TraceRecord> {
    return Promise.resolve(this.trace_);
  }

  override diff(): Promise<string> {
    return Promise.resolve(TASK_DIFF);
  }
}

@Component({
  imports: [TraceView],
  template: `<sp-trace-view [change]="id" />`,
})
class Host {
  readonly id = ID;
}

async function render(source: Source = new Source()) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SpectyData, useValue: source },
      { provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const blocks = () => [...element.querySelectorAll<HTMLElement>("[data-block]")];
  const text = (node: Element | undefined) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  return { element, settle, blocks, text };
}

describe("the block's lines in its diff", () => {
  const scrolled: Element[] = [];
  const original = Element.prototype.scrollIntoView;

  beforeEach(() => {
    scrolled.length = 0;
    // jsdom does not scroll: this notes which element was brought into view.
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = original;
    TestBed.resetTestingModule();
  });

  it("AC3: marks exactly the block's lines in its task's diff and brings the first into view", async () => {
    const { settle, blocks, text } = await render();
    blocks()[1]?.querySelector<HTMLButtonElement>("[data-show-diff]")?.click();
    await settle();
    const marked = [
      ...(blocks()[1]?.querySelectorAll<HTMLElement>("sp-diff-file [data-marked]") ?? []),
    ];
    expect(marked.map((row) => text(row))).toEqual([
      expect.stringContaining("// cabecera"),
      expect.stringContaining("class Panel {}"),
    ]);
    expect(scrolled[0]).toBe(marked[0]);
  });

  it("AC3: opens the diff without marks for a block that does not tell its lines", async () => {
    const source = new Source();
    source.trace_ = {
      ...TRACE,
      blocks: TRACE.blocks.map(({ origin: _, ...block }) => block),
    };
    const { settle, blocks } = await render(source);
    blocks()[1]?.querySelector<HTMLButtonElement>("[data-show-diff]")?.click();
    await settle();
    expect(blocks()[1]?.querySelector("sp-diff-file")).not.toBeNull();
    expect(blocks()[1]?.querySelectorAll("[data-marked]")).toHaveLength(0);
  });

  it("AC3: in the prototype, each block's lines are the ones its task's sample diff added", async () => {
    const repository = "lib/attendance/attendance_repository.dart";
    const trace = await sampleTrace(sampleRecords(Date.now()), ID, repository);
    const file = parseDiff(sampleDiff(ID, "T1")).find((item) => item.path === repository);
    const written = new Map(
      (file?.hunks ?? [])
        .flatMap((hunk) => hunk.lines)
        .filter((line) => line.kind !== "removed")
        .map((line) => [line.newNumber, line.text]),
    );
    const ofT1 = trace.blocks.filter((block) => block.commit.change?.task?.id === "T1");
    expect(ofT1.length).toBeGreaterThan(0);
    for (const block of ofT1) {
      const origin: readonly number[] =
        "origin" in block && Array.isArray(block.origin) ? block.origin : [];
      expect(origin.map((line) => written.get(line))).toEqual(
        trace.lines.slice(block.start - 1, block.end),
      );
    }
  });
});
