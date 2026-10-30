// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { translator } from "@baquia-dev/specty-core/light";
import type { ChangeRecord, ChangeView, ReviewSection, ReviewView } from "../data/records";
import { sampleRecords } from "../data/sample-records";
import { deriveViews } from "../data/views";
import { SECTION_LABELS } from "./comments";
import { SECTION_META, sectionNumber, sectionProgress } from "./section-meta";
import { SpecCards } from "./spec-cards";

/** In review, with two comments. */
const COMMENTED = "20261020-evolucion-trimestre";
/** In review, with changes since its approved revision. */
const REVISED = "20261016-justificar-faltas";
/** In draft, with no comments. */
const DRAFT = "20261021-modo-oscuro";

@Component({
  imports: [SpecCards],
  template: `
    @if (change(); as change) {
      <sp-spec-cards [change]="change" />
    }
  `,
})
class Host {
  readonly change = signal<ChangeView | undefined>(undefined);
}

const record = (id: string): ChangeRecord => {
  const found = sampleRecords(Date.now()).find((candidate) => candidate.state.id === id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
};

const viewOf = (source: ChangeRecord): ChangeView => {
  const view = deriveViews([source])[0];
  if (view === undefined) throw new Error(`no view of ${source.state.id}`);
  return view;
};

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const t = translator("es");

/** How many items a section lists, where it lists them. */
const COUNTS: Partial<Record<ReviewSection, (review: ReviewView) => number>> = {
  assumptions: (review) => review.assumptions.length,
  criteria: (review) => review.criteria.length,
  risks: (review) => review.risks.length,
  tasks: (review) => review.tasks.length,
  files: (review) => review.files.reduce((total, group) => total + group.files.length, 0),
};

/** What a card's header sums up: the section's progress or, without it, how many items it has. */
function summary(key: ReviewSection, review: ReviewView): string {
  const progress = sectionProgress(key, review, t);
  if (progress !== "") return progress;
  const count = COUNTS[key];
  return count === undefined ? "" : String(count(review));
}

async function render(view: ChangeView) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(Host);
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  fixture.componentInstance.change.set(view);
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const card = (key: string) => element.querySelector<HTMLElement>(`section[data-card="${key}"]`);
  const toggle = (key: string) => card(key)?.querySelector<HTMLButtonElement>("h2 button");
  const expanded = (key: string) => toggle(key)?.getAttribute("aria-expanded");
  const opened = () =>
    [...element.querySelectorAll<HTMLButtonElement>("section[data-card] h2 button")]
      .filter((button) => button.getAttribute("aria-expanded") === "true")
      .map((button) => button.closest("section")?.dataset.card);
  const show = async (next: ChangeView) => {
    fixture.componentInstance.change.set(next);
    await settle();
  };
  return { element, card, toggle, expanded, opened, settle, show };
}

describe("SpecCards", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("AC1: shows each present section as a card with its number, title, hint and summary", async () => {
    for (const id of [COMMENTED, REVISED, DRAFT]) {
      const view = viewOf(record(id));
      const { element, card } = await render(view);
      const present = view.review.index.filter((entry) => entry.present);
      const keys = [...element.querySelectorAll<HTMLElement>("section[data-card]")]
        .map((section) => section.dataset.card)
        .filter((key) => key !== "comments" && key !== "review");
      expect(keys, id).toEqual(present.map((entry) => entry.key));
      present.forEach((entry, position) => {
        const header = card(entry.key)?.querySelector("h2");
        const where = `${id} ${entry.key}`;
        expect(text(header), where).toContain(sectionNumber(position));
        expect(text(header), where).toContain(SECTION_LABELS[entry.key].es);
        expect(text(card(entry.key)), where).toContain(SECTION_META[entry.key].hint.es);
        const expected = summary(entry.key, view.review);
        const shown = card(entry.key)?.querySelector("[data-summary]");
        if (expected === "") expect(text(shown), where).toBe("");
        else expect(text(shown), where).toBe(expected);
        const attention = entry.pending + entry.warnings;
        const marked = card(entry.key)?.querySelector("[data-attention]");
        if (attention === 0) expect(marked, where).toBeNull();
        else expect(text(marked), where).toContain(String(attention));
        const comments = card(entry.key)?.querySelector("[data-comments]");
        if (entry.comments === 0) expect(comments, where).toBeNull();
        else expect(text(comments), where).toContain(String(entry.comments));
      });
      expect(element.querySelector("nav"), id).toBeNull();
      expect(element.querySelector("sp-spec-review"), id).toBeNull();
      expect(element.querySelector("textarea, form"), id).toBeNull();
      const buttons = [...element.querySelectorAll("button")].map(text);
      expect(
        buttons.filter((label) => /Aprobar|Rechazar|Comentar|Confirmar|Aceptar/.test(label)),
        id,
      ).toEqual([]);
    }
  });

  it("AC2: opens only the Goal at first, toggles one card at a time, and keeps them on updates", async () => {
    const view = viewOf(record(COMMENTED));
    const { card, toggle, expanded, opened, settle, show } = await render(view);
    expect(opened()).toEqual(["goal"]);
    expect(card("goal")?.querySelector("[data-card-body]")).not.toBeNull();
    expect(card("criteria")?.querySelector("[data-card-body]")).toBeNull();
    const controlled = toggle("goal")?.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    expect(card("goal")?.querySelector(`#${controlled}`)).not.toBeNull();

    toggle("criteria")?.click();
    await settle();
    expect(expanded("criteria")).toBe("true");
    expect(card("criteria")?.querySelector("[data-card-body]")).not.toBeNull();
    expect(opened()).toEqual(["goal", "criteria"]);

    toggle("goal")?.click();
    await settle();
    expect(expanded("goal")).toBe("false");
    expect(card("goal")?.querySelector("[data-card-body]")).toBeNull();
    expect(opened()).toEqual(["criteria"]);

    // Another read of the same change: the person's cards stay as they left them.
    await show(viewOf(record(COMMENTED)));
    expect(opened()).toEqual(["criteria"]);

    // Another change starts again with only its Goal open.
    await show(viewOf(record(DRAFT)));
    expect(opened()).toEqual(["goal"]);
  });

  it("AC3: lists the comments in a card of their own, read only, and only when there are some", async () => {
    const view = viewOf(record(COMMENTED));
    expect(view.review.comments.length).toBeGreaterThan(0);
    const { card } = await render(view);
    const comments = card("comments");
    expect(comments).not.toBeNull();
    for (const comment of view.review.comments) {
      expect(text(comments)).toContain(comment.body);
    }
    expect(comments?.querySelector("textarea, form, input")).toBeNull();

    const draft = viewOf(record(DRAFT));
    expect(draft.review.comments).toEqual([]);
    const without = await render(draft);
    expect(without.card("comments")).toBeNull();
  });

  it("AC3: shows the independent review of the spec in a card before the sections", async () => {
    const said = "Falta un criterio para cuando el correo no llega.";
    const view = viewOf({
      ...record(DRAFT),
      reviews: [{ target: "spec", revision: 1, at: "2026-10-30T10:00:00.000Z", text: said }],
    });
    const { element, card } = await render(view);
    const review = card("review");
    expect(text(review)).toContain(said);
    const first = element.querySelector("section[data-card]");
    expect(first).toBe(review);

    const plain = await render(viewOf(record(DRAFT)));
    expect(plain.card("review")).toBeNull();
  });

  it("AC4: marks the cards of the sections that changed since the approved revision", async () => {
    const view = viewOf(record(REVISED));
    const delta = view.review.delta;
    expect(delta).toBeDefined();
    const changed = new Set(
      (delta?.entries ?? []).map((entry) => entry.section).filter((section) => section !== "title"),
    );
    expect(changed.size).toBeGreaterThan(0);
    const { card } = await render(view);
    for (const entry of view.review.index.filter((candidate) => candidate.present)) {
      const mark = card(entry.key)?.querySelector("[data-changed]");
      if (changed.has(entry.key)) expect(text(mark), entry.key).toBe("Cambió");
      else expect(mark, entry.key).toBeNull();
    }

    const unrevised = await render(viewOf(record(COMMENTED)));
    expect(unrevised.element.querySelector("[data-changed]")).toBeNull();
  });
});
