// SPDX-License-Identifier: Apache-2.0
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FixtureData } from "../data/fixtures";
import { type ChangeView, SpectyData } from "../data/records";
import { deriveViews } from "../data/views";
import { SpecReview } from "./spec-review";

const REVISED = "20261016-justificar-faltas";

@Component({
  imports: [SpecReview],
  template: `<sp-spec-review [change]="change()" />`,
})
class Host {
  readonly change = signal<ChangeView>(undefined as unknown as ChangeView);
}

/** The view of `id` as the store would derive it from the source now. */
async function viewOf(source: SpectyData, id: string): Promise<ChangeView> {
  const found = deriveViews(await source.changes()).find((view) => view.id === id);
  if (found === undefined) throw new Error(`no sample ${id}`);
  return found;
}

async function render(id: string) {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.setItem("specty.lang", "es");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: SpectyData, useClass: FixtureData }] });
  const source = TestBed.inject(SpectyData);
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.change.set(await viewOf(source, id));
  const settle = async () => {
    for (let round = 0; round < 10; round++) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
    }
  };
  await settle();
  const element: HTMLElement = fixture.nativeElement;
  const review = () => element.querySelector<HTMLElement>("sp-spec-review");
  const delta = () => element.querySelector<HTMLElement>("sp-review-delta");
  const approve = () =>
    [...element.querySelectorAll<HTMLButtonElement>("[role=region] sp-button button")].at(-1);
  // What the store does when the source changes: derive the view again.
  const refresh = async () => {
    fixture.componentInstance.change.set(await viewOf(source, id));
    await settle();
  };
  return { review, delta, approve, settle, refresh };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, " ").trim() ?? "";

describe("SpecReview modes", () => {
  afterEach(() => TestBed.resetTestingModule());

  it("starts on the changes since the approval, and switches to the full spec and back (AC1, AC4)", async () => {
    const { review, delta, approve, settle, refresh } = await render(REVISED);
    expect(text(delta()?.querySelector("h2"))).toBe("Qué cambió desde que aprobaste r2");
    expect(review()?.querySelector("nav")).toBeNull();
    expect(review()?.querySelectorAll("[data-section]")).toHaveLength(0);

    // A2 changed: approving waits until it is decided, right from the changes.
    expect(approve()?.disabled).toBe(true);
    delta()
      ?.querySelector<HTMLButtonElement>("sp-assumption-row[data-item=A2] sp-button button")
      ?.click();
    await refresh();
    expect(approve()?.disabled).toBe(false);
    expect(text(approve())).toBe("Aprobar r3");
    // Live updates of the same change keep the view the person is on.
    expect(delta()).not.toBeNull();

    delta()?.querySelector<HTMLButtonElement>("header sp-button button")?.click();
    await settle();
    expect(delta()).toBeNull();
    expect(review()?.querySelectorAll("[data-section]").length).toBeGreaterThan(0);
    expect(review()?.querySelector("nav")).not.toBeNull();
    const back = review()?.querySelector<HTMLButtonElement>("[data-mode-toggle] button");
    expect(text(back)).toBe("Ver solo los cambios desde r2");
    expect(document.activeElement).toBe(back);
    await refresh();
    expect(delta()).toBeNull();

    back?.click();
    await settle();
    expect(delta()).not.toBeNull();
    expect(document.activeElement).toBe(delta()?.querySelector("header sp-button button"));
  });

  it("shows the full spec when there was no approval before (AC5)", async () => {
    const { review, delta } = await render("20261020-evolucion-trimestre");
    expect(delta()).toBeNull();
    expect(review()?.querySelector("[data-mode-toggle]")).toBeNull();
    expect(review()?.querySelectorAll("[data-section]").length).toBeGreaterThan(0);
  });
});
