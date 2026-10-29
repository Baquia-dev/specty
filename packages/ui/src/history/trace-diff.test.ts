// SPDX-License-Identifier: Apache-2.0
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import type { WhyCommit } from "@baquia-dev/specty-core";
import { ActionError, type ChangeRecord } from "../data/records";
import { SpectyData } from "../data/source";
import type { TraceRecord } from "../data/trace";
import { HIGHLIGHT, type Highlight } from "../highlight/highlight";
import { TraceView } from "./trace-view";

const ID = "20261018-asistencia-curso";
const OTHER = "20261015-otro-cambio";
const PATH = "lib/attendance/course_panel.dart";

const OUTSIDE: WhyCommit = {
  commit: "5d2a7b0",
  date: "2026-10-01",
  author: "Ana Gómez",
  subject: "Primera versión",
};
const OURS: WhyCommit = {
  commit: "8b0a4f6",
  date: "2026-10-18",
  author: "Ana Gómez",
  subject: "feat: panel",
  change: {
    id: ID,
    title: "Panel de asistencia por curso",
    task: { id: "T2", title: "Panel con estudiantes destacados" },
    criteria: [],
  },
};
const THEIRS: WhyCommit = {
  commit: "1c2d3e4",
  date: "2026-10-15",
  author: "Ana Gómez",
  subject: "feat: otra cosa",
  change: { id: OTHER, task: { id: "T1", title: "Otra cosa" }, criteria: [] },
};

const TRACE: TraceRecord = {
  path: PATH,
  commit: "8b0a4f6",
  lines: ["import 'a.dart';", "class Panel {}", "void main() {}"],
  blocks: [
    { start: 1, end: 1, commit: OUTSIDE },
    { start: 2, end: 2, commit: OURS },
    { start: 3, end: 3, commit: THEIRS },
  ],
};

/** The diff `git diff` would give of a file the task added, with these lines. */
const added = (path: string, ...lines: readonly string[]) =>
  [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "index 0000000..8b0a4f6",
    "--- /dev/null",
    `+++ b/${path}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");

/** A source with one traced file, and the diffs of its tasks; it notes what it was asked. */
class Source extends SpectyData {
  readonly asked: [string, string | undefined][] = [];
  readonly diffs = new Map<string, string>([
    [`${ID}/T2`, added(PATH, "class Panel {}", "// del panel")],
    [`${OTHER}/T1`, added(PATH, "void main() {}", "// de la otra")],
  ]);
  failure: ActionError | undefined;

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
    return Promise.resolve(TRACE);
  }

  override diff(change: string, task?: string): Promise<string> {
    this.asked.push([change, task]);
    if (this.failure !== undefined) return Promise.reject(this.failure);
    return Promise.resolve(this.diffs.get(`${change}/${task}`) ?? "");
  }
}

/** Colors every line as a keyword, whole. */
const paint: Highlight = (file) =>
  Promise.resolve(
    new Map(
      file.hunks
        .flatMap((hunk) => hunk.lines)
        .map((line) => [line, [{ text: line.text, color: "var(--color-code-keyword)" }]]),
    ),
  );

@Component({
  imports: [TraceView],
  template: `<sp-trace-view [change]="id" />`,
})
class Host {
  readonly id = ID;
}

async function render(source: Source = new Source(), highlight: Highlight = paint) {
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
      { provide: HIGHLIGHT, useValue: highlight },
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
  const text = (node: Element | null | undefined) =>
    node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  /** The colored pieces of the traced lines, as «text: color». */
  const colored = () =>
    [...element.querySelectorAll<HTMLElement>("[data-line] span")]
      .filter((span) => span.style.color !== "")
      .map((span) => `${span.textContent}: ${span.style.color}`);
  return { source, element, settle, blocks, text, colored };
}

describe("the traceability's colors and diffs", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: colors the code as the diff viewer does, and leaves it plain when it cannot", async () => {
    const painted = await render();
    expect(painted.colored()).toContain("class Panel {}: var(--color-code-keyword)");

    const plain = await render(new Source(), () => Promise.resolve(undefined));
    expect(plain.colored()).toEqual([]);
    expect(plain.text(plain.element.querySelectorAll("[data-line]")[1])).toContain(
      "class Panel {}",
    );
  });

  it("AC2: opens under a block the diff of its file in the block's task, and closes it", async () => {
    const { source, settle, blocks, text } = await render();
    expect(blocks()[0]?.querySelector("[data-show-diff]")).toBeNull();

    const show = () => blocks()[1]?.querySelector<HTMLButtonElement>("[data-show-diff]");
    expect(text(show())).toBe("Ver diff");
    expect(show()?.getAttribute("aria-expanded")).toBe("false");
    show()?.click();
    await settle();
    expect(source.asked).toEqual([[ID, "T2"]]);
    expect(text(blocks()[1]?.querySelector("sp-diff-file"))).toContain("// del panel");
    expect(text(show())).toBe("Ocultar diff");
    expect(show()?.getAttribute("aria-expanded")).toBe("true");

    show()?.click();
    await settle();
    expect(blocks()[1]?.querySelector("sp-diff-file")).toBeNull();

    // A block of another change opens that change's task.
    blocks()[2]?.querySelector<HTMLButtonElement>("[data-show-diff]")?.click();
    await settle();
    expect(source.asked.at(-1)).toEqual([OTHER, "T1"]);
    expect(text(blocks()[2]?.querySelector("sp-diff-file"))).toContain("// de la otra");
  });

  it("AC3: says why when the source cannot give the diff, or the task did not change the file", async () => {
    const failing = new Source();
    failing.failure = new ActionError({
      es: "Este cambio aún no tiene commits.",
      en: "This change has no commits yet.",
    });
    const refused = await render(failing);
    refused.blocks()[1]?.querySelector<HTMLButtonElement>("[data-show-diff]")?.click();
    await refused.settle();
    expect(refused.text(refused.blocks()[1]?.querySelector("[data-trace-diff-message]"))).toContain(
      "Este cambio aún no tiene commits.",
    );

    const elsewhere = new Source();
    elsewhere.diffs.set(`${ID}/T2`, added("lib/otro.dart", "otra cosa"));
    const missing = await render(elsewhere);
    missing.blocks()[1]?.querySelector<HTMLButtonElement>("[data-show-diff]")?.click();
    await missing.settle();
    expect(missing.text(missing.blocks()[1]?.querySelector("[data-trace-diff-message]"))).toContain(
      "no cambió este archivo",
    );
  });
});
