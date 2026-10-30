// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { type DiffFile, parseDiff } from "../data/diff";
import { sampleDiff } from "../data/sample-diffs";
import { HIGHLIGHT } from "../highlight/highlight";
import { DiffViewer } from "./diff-viewer";

const CHANGE = "20261018-asistencia-curso";
const KEY = "specty.diff.mode";

@Component({
  imports: [DiffViewer],
  template: `<sp-diff-viewer [files]="files()" [range]="range()"><span data-toolbar>Todo el cambio</span></sp-diff-viewer>`,
})
class Host {
  readonly files = signal<readonly DiffFile[]>([]);
  readonly range = signal<string | undefined>(undefined);
}

/** A screen as wide as `wide` says; `resize` changes it as the browser would. */
function screen(wide: boolean) {
  const listeners: ((event: { matches: boolean }) => void)[] = [];
  window.matchMedia = ((query: string) => ({
    matches: query === "(min-width: 640px)" && wide,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      if (query === "(min-width: 640px)") listeners.push(listener);
    },
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  return (matches: boolean) => {
    for (const listener of listeners) listener({ matches });
  };
}

async function render(
  diff: string,
  { wide = true, lang = "es", range = "5d2a7b0 → 3c9d1e2" } = {},
) {
  const resize = screen(wide);
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  // Plain code: the colors are tested in diff-file.test.ts and highlight.test.ts.
  const plain = () => Promise.resolve(undefined);
  TestBed.configureTestingModule({ providers: [{ provide: HIGHLIGHT, useValue: plain }] });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.files.set(parseDiff(diff));
  fixture.componentInstance.range.set(range);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const file = (path: string) => element.querySelector<HTMLElement>(`[data-file="${path}"]`);
  const settle = () => fixture.whenStable();
  return { fixture, element, file, settle, resize };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const texts = (elements: Iterable<Element>) => [...elements].map(text);

/** The text of `element` without what `hide` selects: what a person sees, or what is heard. */
function without(hide: string, element: Element | null | undefined): string {
  const copy = element?.cloneNode(true);
  if (!(copy instanceof Element)) return "";
  for (const hidden of copy.querySelectorAll(hide)) hidden.remove();
  return text(copy);
}
const seen = (element: Element | null | undefined) => without(".sr-only", element);
const heard = (element: Element | null | undefined) => without("[aria-hidden=true]", element);

const REPOSITORY = "lib/attendance/attendance_repository.dart";
const REPOSITORY_TEST = "test/attendance/attendance_repository_test.dart";

/** A new file of `count` lines. */
function longFile(count: number): string {
  const lines = Array.from({ length: count }, (_, index) => `+line ${index + 1}`);
  return [
    "diff --git a/long.txt b/long.txt",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/long.txt",
    `@@ -0,0 +1,${count} @@`,
    ...lines,
  ].join("\n");
}

describe("Diff viewer", () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => TestBed.resetTestingModule());

  it("shows each file with its path, status, counts, numbered hunks, signs and changed words (AC1)", async () => {
    const { element, file } = await render(sampleDiff(CHANGE, "T1"));
    expect(text(element.querySelector("[data-toolbar]"))).toBe("Todo el cambio");
    const summary = element.querySelector("[data-summary]");
    expect(seen(summary)).toBe("5d2a7b0 → 3c9d1e2 · 2 archivos · +35 −2");
    expect(heard(summary)).toBe("5d2a7b0 → 3c9d1e2 · 2 archivos · 35 añadidas, 2 quitadas");
    const list = [...element.querySelectorAll("[data-goto]")];
    expect(texts(element.querySelectorAll("[data-goto] [data-counts]"))).toEqual([
      "+24 −1",
      "+11 −1",
    ]);
    expect(list.map(heard)).toEqual([
      `${REPOSITORY}, 24 añadidas, 1 quitada`,
      `${REPOSITORY_TEST}, 11 añadidas, 1 quitada`,
    ]);
    const repository = file(REPOSITORY);
    const toggle = repository?.querySelector("[data-file-toggle]");
    expect(text(toggle?.querySelector("[data-counts]"))).toBe("+24 −1");
    expect(heard(toggle)).toBe(`${REPOSITORY}, Modificado, 24 añadidas, 1 quitada`);
    // The chevron stays apart; a path breaks only after a slash, in the header and in the list.
    expect(toggle?.querySelector(":scope > [data-head] [data-status]")).not.toBeNull();
    expect(toggle?.querySelectorAll("[data-path] wbr")).toHaveLength(3);
    expect(list[0]?.querySelectorAll("[data-path] wbr")).toHaveLength(3);
    const [first] = repository?.querySelectorAll("[data-hunk]") ?? [];
    expect(text(first?.querySelector("[aria-hidden]"))).toBe("@@ -1,6 +1,7 @@");
    const added = repository?.querySelector("[data-line=added]");
    expect(texts(added?.querySelectorAll(":scope > span") ?? [])).toEqual([
      "",
      "4",
      "+",
      "Añadida: import 'week.dart';",
    ]);
    const removed = file(REPOSITORY_TEST)?.querySelector("[data-line=removed]");
    expect(text(removed?.querySelector(":scope > span:nth-child(3)"))).toBe("−");
    expect(text(removed?.querySelector("[data-changed]"))).toBe("12");
    const marked = repository?.querySelectorAll("[data-line=added] [data-changed]") ?? [];
    expect(texts(marked)).toContain(", orderBy: 'date'");
  });

  it("pairs removed and added lines side by side, and keeps the choice (AC2)", async () => {
    const { element, file, settle } = await render(sampleDiff(CHANGE, "T1"));
    expect(element.querySelector("[data-pair]")).toBeNull();
    // Room for the longest number (two digits), the sign and the code; on each side when split.
    const columns = () =>
      file(REPOSITORY)
        ?.querySelector<HTMLElement>("[data-body]")
        ?.style.getPropertyValue("--diff-cols");
    const side = "calc(2ch + 1rem) 1.25rem minmax(0, 1fr)";
    expect(columns()).toBe(`calc(2ch + 1rem) ${side}`);
    element.querySelector<HTMLElement>("[data-mode] [data-value=split]")?.click();
    await settle();
    expect(localStorage.getItem(KEY)).toBe("split");
    expect(columns()).toBe(`${side} ${side}`);
    const test = file(REPOSITORY_TEST);
    expect(test?.querySelector("[data-line]")).toBeNull();
    const pairs = [...(test?.querySelectorAll("[data-pair]") ?? [])];
    const changed = pairs.find((pair) => text(pair).includes("hasLength(12)"));
    const [left, right] = changed?.querySelectorAll("[data-code]") ?? [];
    expect(text(left)).toBe("Quitada: expect(await repo.recordsFor('5A'), hasLength(12));");
    expect(text(right)).toBe("Añadida: expect(await repo.recordsFor('5A'), hasLength(14));");
    // Added lines with nothing removed before them have an empty left side.
    const lone = pairs.find((pair) => text(pair).includes("weekly percentage per course"));
    expect(text(lone?.querySelector("[data-code]"))).toBe("");
  });

  it("opens in the mode chosen before", async () => {
    localStorage.setItem(KEY, "split");
    const { element } = await render(sampleDiff(CHANGE, "T1"));
    expect(element.querySelector("[data-pair]")).not.toBeNull();
  });

  it("shows only the unified view on a phone (AC2)", async () => {
    localStorage.setItem(KEY, "split");
    const { element, settle, resize } = await render(sampleDiff(CHANGE, "T1"), { wide: false });
    expect(element.querySelector("[data-mode]")).toBeNull();
    expect(element.querySelector("[data-pair]")).toBeNull();
    expect(element.querySelector("[data-line]")).not.toBeNull();
    // Turned wide, the choice comes back.
    resize(true);
    await settle();
    expect(element.querySelector("[data-mode]")).not.toBeNull();
    expect(element.querySelector("[data-pair]")).not.toBeNull();
  });

  it("shows the first lines of a long file, and the rest on request (AC3)", async () => {
    const { element, settle } = await render(longFile(70));
    expect(element.querySelectorAll("[data-line]")).toHaveLength(40);
    const more = element.querySelector<HTMLElement>("[data-more]");
    expect(text(more)).toBe("Mostrar 30 líneas más");
    more?.click();
    await settle();
    expect(element.querySelectorAll("[data-line]")).toHaveLength(70);
    expect(element.querySelector("[data-more]")).toBeNull();
    // The focus goes on, to the first line it brought.
    expect(text(document.activeElement)).toContain("line 41");
  });

  it("shows a file of up to 60 lines whole", async () => {
    const { element } = await render(longFile(60));
    expect(element.querySelectorAll("[data-line]")).toHaveLength(60);
    expect(element.querySelector("[data-more]")).toBeNull();
  });

  it("folds and unfolds each file (AC3)", async () => {
    const { file, settle } = await render(sampleDiff(CHANGE, "T1"));
    const toggle = file(REPOSITORY)?.querySelector<HTMLElement>("[data-file-toggle]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.getAttribute("aria-controls")).toBe(
      file(REPOSITORY)?.querySelector("[data-body]")?.id,
    );
    toggle?.click();
    await settle();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.hasAttribute("aria-controls")).toBe(false);
    expect(file(REPOSITORY)?.querySelector("[data-body]")).toBeNull();
    // The other file stays open.
    expect(file(REPOSITORY_TEST)?.querySelector("[data-body]")).not.toBeNull();
    toggle?.click();
    await settle();
    expect(file(REPOSITORY)?.querySelector("[data-line]")).not.toBeNull();
  });

  it("takes the person to a file from the list", async () => {
    const { element, file } = await render(sampleDiff(CHANGE, "T1"));
    element.querySelectorAll<HTMLElement>("[data-goto]")[1]?.click();
    expect(document.activeElement).toBe(file(REPOSITORY_TEST)?.querySelector("[data-file-toggle]"));
  });

  it("reads to a screen reader whether each line was added or removed, without numbers or signs (AC4)", async () => {
    const { element, file, settle } = await render(sampleDiff(CHANGE, "T1"));
    for (const row of element.querySelectorAll("[data-line]")) {
      const [oldNumber, newNumber, sign] = row.querySelectorAll(":scope > span");
      for (const cell of [oldNumber, newNumber, sign]) {
        expect(cell?.getAttribute("aria-hidden")).toBe("true");
      }
    }
    const spoken = (kind: string) =>
      texts(element.querySelectorAll(`[data-line=${kind}] [data-code] .sr-only`));
    expect(new Set(spoken("added"))).toEqual(new Set(["Añadida:"]));
    expect(new Set(spoken("removed"))).toEqual(new Set(["Quitada:"]));
    expect(spoken("context")).toEqual([]);
    expect(text(file(REPOSITORY)?.querySelector("[data-hunk] .sr-only"))).toBe("Desde la línea 1");
    expect(text(file(REPOSITORY)?.querySelectorAll("[data-hunk] .sr-only")[1])).toBe(
      "Desde la línea 11: class AttendanceRepository {",
    );
    // Side by side, a context line shows twice and is heard once.
    element.querySelector<HTMLElement>("[data-mode] [data-value=split]")?.click();
    await settle();
    const context = [...element.querySelectorAll("[data-pair]")].find((pair) =>
      text(pair).includes("class AttendanceRepository {"),
    );
    const [left, right] = context?.querySelectorAll("[data-code]") ?? [];
    expect(left?.hasAttribute("aria-hidden")).toBe(false);
    expect(right?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says when there are no changes", async () => {
    const { element } = await render("");
    expect(text(element.querySelector("[data-empty]"))).toBe("No hay cambios.");
    expect(element.querySelector("[data-summary]")).toBeNull();
  });

  it("names new, deleted, renamed and binary files", async () => {
    const diff = [
      "diff --git a/old/name.ts b/new/name.ts",
      "similarity index 100%",
      "rename from old/name.ts",
      "rename to new/name.ts",
      "diff --git a/logo.png b/logo.png",
      "index 1a2b3c4..5d6e7f8 100644",
      "Binary files a/logo.png and b/logo.png differ",
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-one",
      "-two",
    ].join("\n");
    const { element, file } = await render(diff, { range: "" });
    const summary = element.querySelector("[data-summary]");
    expect(seen(summary)).toBe("3 archivos · +0 −2");
    expect(heard(summary)).toBe("3 archivos · 0 añadidas, 2 quitadas");
    const path = file("new/name.ts")?.querySelector("[data-path]");
    expect(seen(path)).toBe("old/name.ts → new/name.ts");
    expect(heard(path)).toBe("old/name.ts, ahora new/name.ts");
    expect(text(file("new/name.ts")?.querySelector("[data-status]"))).toBe("Renombrado");
    expect(text(file("new/name.ts")?.querySelector("[data-body]"))).toBe(
      "Sin cambios de contenido.",
    );
    expect(text(file("logo.png")?.querySelector("[data-body]"))).toBe(
      "Archivo binario: no se muestra.",
    );
    expect(text(file("gone.txt")?.querySelector("[data-status]"))).toBe("Borrado");
    expect(text(file("gone.txt")?.querySelector("[data-hunk] .sr-only"))).toBe("Desde la línea 1");
  });

  it("speaks English too", async () => {
    const { element } = await render(longFile(70), { lang: "en", range: "" });
    const summary = element.querySelector("[data-summary]");
    expect(seen(summary)).toBe("1 file · +70 −0");
    expect(heard(summary)).toBe("1 file · 70 added, 0 removed");
    expect(text(element.querySelector("[data-status]"))).toBe("Added");
    expect(text(element.querySelector("[data-more]"))).toBe("Show 30 more lines");
    expect(element.querySelector("[data-files]")).toBeNull();
    expect(texts(element.querySelectorAll("[data-mode] label"))).toEqual([
      "Unified",
      "Side by side",
    ]);
  });

  it("AC2: in the chat, its bar neither sticks nor paints a band", async () => {
    const { element } = await render(sampleDiff(CHANGE, "T1"));
    const bar = element.querySelector("[data-bar]");
    // Outside the chat it still sticks over the page's ground.
    expect(bar?.classList.contains("sticky")).toBe(true);
    expect(bar?.classList.contains("embedded:static")).toBe(true);
    expect(bar?.classList.contains("embedded:bg-transparent")).toBe(true);
  });
});
