// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { sampleRecords } from "../data/fixtures";
import { type ChangeRecord, type CommentAnchor, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { Preferences } from "../theme/preferences";
import { ReviewDelta } from "./delta-review";

const REVISED = "20261016-justificar-faltas";
const CHANGE = deriveViews(sampleRecords(Date.now())).find((view) => view.id === REVISED);

class Recording extends SpectyData {
  readonly calls: unknown[][] = [];
  changes(): Promise<readonly ChangeRecord[]> {
    return Promise.resolve([]);
  }
  subscribe(): () => void {
    return () => undefined;
  }
  override decideAssumption(...args: unknown[]): Promise<void> {
    this.calls.push(args);
    return Promise.resolve();
  }
}

@Component({
  imports: [ReviewDelta],
  template: `
    @if (change.review.delta; as delta) {
      <sp-review-delta [change]="change" [delta]="delta" [editable]="editable()" (comment)="anchors.push($event)" (showFull)="full = full + 1" />
    }
  `,
})
class Host {
  readonly change = CHANGE ?? fail();
  readonly editable = signal(true);
  readonly anchors: CommentAnchor[] = [];
  full = 0;
}

function fail(): never {
  throw new Error(`no sample ${REVISED}`);
}

async function render(lang: "es" | "en" = "es") {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", lang);
  TestBed.resetTestingModule();
  const source = new Recording();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useValue: source }] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const item = (key: string) => element.querySelector<HTMLElement>(`[data-item="${key}"]`);
  return { fixture, element, source, item, host: fixture.componentInstance };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("ReviewDelta", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("says what changed since the approval, grouped as in the document (AC1)", async () => {
    const { element, host } = await render();
    expect(text(element.querySelector("h2"))).toBe("Qué cambió desde que aprobaste r2");
    expect(text(element.querySelector("header p"))).toBe("r3 · frente a r2");
    expect(text(element.querySelector("[data-summary]"))).toBe(
      "5 añadidos · 4 modificados · 1 eliminado",
    );
    const groups = [...element.querySelectorAll<HTMLElement>("[data-delta-section]")];
    expect(groups.map((group) => group.dataset.deltaSection)).toEqual([
      "goal",
      "assumptions",
      "criteria",
      "files",
      "tasks",
      "risks",
    ]);
    expect(text(groups[2]?.querySelector("h3"))).toBe("Criterios");
    element.querySelector<HTMLButtonElement>("header sp-button button")?.click();
    expect(host.full).toBe(1);
  });

  it("marks each change with color, icon and text, and lets items be commented on (AC1)", async () => {
    const { item, host } = await render();
    const mark = (key: string) => item(key)?.querySelector<HTMLElement>("sp-change-mark");
    expect(text(mark("AC4"))).toBe("Añadido");
    expect(text(mark("AC2"))).toBe("Modificado");
    expect(text(mark("R1"))).toBe("Eliminado");
    expect(mark("R1")?.style.color).toBe("var(--color-phase-cancelled)");
    expect(mark("AC4")?.querySelector("svg")).not.toBeNull();
    expect(text(item("AC2")?.querySelector(".font-mono"))).toBe("AC2");
    item("AC2")?.querySelector<HTMLButtonElement>("sp-icon-button button")?.click();
    expect(host.anchors).toEqual([{ item: "AC2" }]);
    // A removed item can no longer be commented on.
    expect(item("R1")?.querySelector("sp-icon-button")).toBeNull();
  });

  it("shows modified text as a word diff that a screen reader can follow (AC2)", async () => {
    const { item, element } = await render();
    const parts = (tag: string) =>
      [...(item("AC2")?.querySelectorAll(tag) ?? [])].map((part) => text(part));
    // Punctuation apart: only the new words are marked, "justificada." is not repeated.
    expect(parts("del")).toEqual([]);
    expect(parts("ins")).toEqual(["[añadido: y la familia recibe un aviso]"]);
    expect(text(item("AC2")?.querySelector("sp-word-diff"))).toMatch(/^CUANDO el tutor acepta/);
    expect(text(item("R1")?.querySelector("sp-word-diff"))).toBe(
      "Las fotos del móvil pesan demasiado. Mitigación: reducirlas antes de enviarlas (AC3).",
    );
    const goal = element.querySelector("[data-delta-section=goal] sp-word-diff");
    // The goal only gained words: nothing struck out.
    expect(goal?.querySelector("del")).toBeNull();
    expect([...(goal?.querySelectorAll("ins") ?? [])].map((part) => text(part))).toEqual([
      "[añadido: o un PDF ]",
      "[añadido: recibe un aviso cuando ]",
    ]);
  });

  it("keeps its screen-reader text inside a positioned box, so the page itself never scrolls (AC2)", async () => {
    const { element } = await render();
    const delta = element.querySelector("sp-review-delta");
    const hidden = [...(delta?.querySelectorAll(".sr-only") ?? [])];
    expect(hidden.length).toBeGreaterThan(0);
    // `sr-only` is absolute: without a positioned ancestor in the scrolling area it escapes it.
    for (const span of hidden) expect(span.closest(".relative")).not.toBeNull();
    expect(delta?.className.split(" ")).toContain("relative");
  });

  it("marks possible new scope, with its reason (AC3)", async () => {
    const { item } = await render();
    const note = item("T4")?.querySelector("[data-new-scope]");
    expect(text(note)).toContain("Posible alcance nuevo:");
    expect(text(note)).toContain("lib/notifications/absence_notice.dart");
    expect(note?.querySelector("svg")).not.toBeNull();
    expect(item("T3")?.querySelector("[data-new-scope]")).toBeNull();
  });

  it("decides changed assumptions right there (AC4)", async () => {
    const { item, source, fixture, host } = await render();
    const row = item("A2");
    expect(row?.tagName.toLowerCase()).toBe("sp-assumption-row");
    expect(text(row?.querySelector("sp-change-mark"))).toBe("Modificado");
    expect(text(row?.querySelector("ins"))).toContain("o un PDF");
    expect(text(row?.querySelector("[data-decision]"))).toBe("Por decidir");
    row?.querySelector<HTMLButtonElement>("sp-button button")?.click();
    expect(source.calls).toEqual([[REVISED, "A2", "confirmed"]]);
    host.editable.set(false);
    await fixture.whenStable();
    expect(row?.querySelector("sp-button")).toBeNull();
  });

  it("speaks English too", async () => {
    const { element, item } = await render("en");
    TestBed.inject(Preferences);
    expect(text(element.querySelector("h2"))).toBe("What changed since you approved r2");
    expect(text(element.querySelector("[data-summary]"))).toBe("5 added · 4 modified · 1 removed");
    expect(text(item("T4")?.querySelector("[data-new-scope]"))).toContain("Possible new scope:");
    expect(text(item("AC2")?.querySelector("ins"))).toContain("[added:");
  });
});
