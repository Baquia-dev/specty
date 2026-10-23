// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { FixtureData, sampleRecords } from "../data/fixtures";
import { type ChangeView, SpectyData } from "../data/records";
import { sampleDiff } from "../data/sample-diffs";
import { deriveViews } from "../data/views";
import { HIGHLIGHT } from "../highlight/highlight";
import { ChangesView } from "./changes-view";

const found = deriveViews(sampleRecords(Date.now())).find(
  (item) => item.id === "20261018-asistencia-curso",
);
if (found === undefined) throw new Error("no sample change");
const ASISTENCIA: ChangeView = found;

/** The same change with its tasks' commits left out up to `keep`. */
function withCommits(keep: number): ChangeView {
  const tasks = ASISTENCIA.progress.tasks.map((task, index) => {
    if (index < keep) return task;
    const { commit: _commit, ...rest } = task;
    return rest;
  });
  return { ...ASISTENCIA, progress: { ...ASISTENCIA.progress, tasks } };
}

@Component({
  imports: [ChangesView],
  template: `<sp-changes-view [change]="change()" [(task)]="task" />`,
})
class Host {
  readonly change = signal(ASISTENCIA);
  readonly task = signal("all");
}

/** Diffs that arrive when the test says so. */
class SlowData extends FixtureData {
  readonly asked: {
    readonly task: string | undefined;
    readonly resolve: (text: string) => void;
  }[] = [];
  override diff(_change: string, task?: string): Promise<string> {
    return new Promise((resolve) => this.asked.push({ task, resolve }));
  }
  /** Gives the oldest diff asked for, as the fixtures have it. */
  answer(): void {
    const next = this.asked.shift();
    next?.resolve(sampleDiff("20261018-asistencia-curso", next.task));
  }
}

/** A source with no diffs: SpectyData explains it in its own words. */
class NoDiffs extends FixtureData {
  override diff(change: string, task?: string): Promise<string> {
    return SpectyData.prototype.diff.call(this, change, task);
  }
}

/** A source that fails with no words for the person. */
class Broken extends FixtureData {
  override diff(): Promise<string> {
    return Promise.reject(new Error("boom"));
  }
}

/** The slow source of the test that is running. */
function slow(): SlowData {
  const source = TestBed.inject(SpectyData);
  if (!(source instanceof SlowData)) throw new Error("Not the slow source");
  return source;
}

async function render(
  change = ASISTENCIA,
  source: typeof FixtureData = FixtureData,
  settle = true,
) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SpectyData, useClass: source },
      { provide: HIGHLIGHT, useValue: () => Promise.resolve(undefined) },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.change.set(change);
  if (settle) await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const text = (selector: string) =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const files = () =>
    [...element.querySelectorAll("sp-diff-file")].map((file) => file.getAttribute("data-file"));
  const choose = async (value: string) => {
    element.querySelector<HTMLElement>(`[data-scope] [data-value="${value}"]`)?.click();
    await fixture.whenStable();
  };
  return { fixture, element, text, files, choose };
}

describe("Changes view", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("shows the whole change, or the task chosen, with its range (AC2)", async () => {
    const { fixture, element, text, files, choose } = await render();
    const options = [...element.querySelectorAll("[data-scope] label")].map((label) =>
      label.textContent?.trim(),
    );
    expect(options).toEqual(["Todo el cambio", "T1", "T2"]);
    expect(text("[data-summary]")).toContain("5d2a7b0 → 8b0a4f6 · 4 archivos");
    expect(files()).toHaveLength(4);
    await choose("T2");
    expect(fixture.componentInstance.task()).toBe("T2");
    expect(text("[data-summary]")).toContain("3c9d1e2 → 8b0a4f6 · 2 archivos");
    expect(files()).toEqual([
      "lib/attendance/course_panel.dart",
      "test/attendance/course_panel_test.dart",
    ]);
  });

  it("follows a task chosen from outside, and the whole change for one without a commit", async () => {
    const { fixture, text } = await render();
    fixture.componentInstance.task.set("T1");
    await fixture.whenStable();
    expect(text("[data-summary]")).toContain("5d2a7b0 → 3c9d1e2 · 2 archivos");
    fixture.componentInstance.task.set("T9");
    await fixture.whenStable();
    expect(text("[data-summary]")).toContain("5d2a7b0 → 8b0a4f6 · 4 archivos");
  });

  it("hides the bar when only one task has a commit", async () => {
    const { element, text } = await render(withCommits(1));
    expect(element.querySelector("[data-scope]")).toBeNull();
    expect(text("[data-summary]")).toContain("5d2a7b0 → 3c9d1e2");
  });

  it("says when no task has a commit yet, and asks for nothing (AC4)", async () => {
    const { element, text } = await render(withCommits(0), SlowData);
    expect(text("sp-empty-state h2")).toBe("Aún no hay cambios que ver");
    expect(element.querySelector("sp-diff-viewer")).toBeNull();
    expect(slow().asked).toHaveLength(0);
  });

  it("shows loading lines first, and keeps the last diff while the next one loads (AC4)", async () => {
    // Not settled: the diff is still on its way.
    const { fixture, element, files } = await render(ASISTENCIA, SlowData, false);
    fixture.detectChanges();
    // The loading lines go under the band, with the title and the bar already in place.
    expect(element.querySelector("sp-diff-viewer [diffStatus] sp-skeleton")).not.toBeNull();
    expect(element.querySelector("[data-bar] #acceptance-changes")).not.toBeNull();
    expect(element.querySelector("[data-summary]")).toBeNull();
    const source = slow();
    source.answer();
    await fixture.whenStable();
    expect(files()).toHaveLength(4);
    expect(element.querySelector("sp-skeleton")).toBeNull();
    // Choosing T1: the bar stays, with the last diff dimmed and busy until T1's arrives.
    element.querySelector<HTMLElement>('[data-scope] [data-value="T1"]')?.click();
    fixture.detectChanges();
    const diff = element.querySelector("[data-content]");
    expect(diff?.getAttribute("aria-busy")).toBe("true");
    expect(diff?.className).toContain("opacity-60");
    expect(files()).toHaveLength(4);
    expect(element.querySelector<HTMLInputElement>('[data-scope] input[value="T1"]')?.checked).toBe(
      true,
    );
    source.answer();
    await fixture.whenStable();
    expect(files()).toHaveLength(2);
    expect(element.querySelector("[data-content]")?.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps the title and the bar in one band fixed under the change's bar (AC1)", async () => {
    const { element } = await render();
    const band = element.querySelector<HTMLElement>("sp-diff-viewer [data-bar]");
    expect(band?.className).toContain("sticky");
    expect(band?.className).toContain("top-[var(--sp-sticky-top,0px)]");
    // On the page's ground, so the code passing under it does not show.
    expect(band?.className).toContain("bg-bg");
    expect(band?.querySelector("#acceptance-changes")?.textContent?.trim()).toBe("Cambios");
    expect(band?.querySelector("[data-scope]")).not.toBeNull();
    // The diff itself scrolls under it.
    expect(band?.querySelector("[data-summary], sp-diff-file")).toBeNull();
  });

  it("explains why the source could not give the diff (AC4)", async () => {
    const missing = await render({ ...ASISTENCIA, id: "20261099-nada" });
    expect(missing.text("[data-error]")).toBe("No existe el cambio 20261099-nada.");
    // The bar stays, to choose other changes.
    expect(missing.element.querySelector("[data-scope]")).not.toBeNull();
    const none = await render(ASISTENCIA, NoDiffs);
    expect(none.text("[data-error]")).toBe("Esta fuente no da diffs.");
    const broken = await render(ASISTENCIA, Broken);
    expect(broken.text("[data-error]")).toBe("No se pudo leer el diff.");
    expect(broken.element.querySelector("[role=alert]")).not.toBeNull();
  });

  it("takes the focus to its title", async () => {
    const { fixture } = await render();
    fixture.debugElement.query(By.directive(ChangesView)).componentInstance.focus();
    expect(document.activeElement?.id).toBe("acceptance-changes");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });
});
